-- 0012_fastfood_quantity.sql
-- Store the number of fast-food portions requested per queue entry.

alter table queue_entries
  add column if not exists quantity int not null default 1;

alter table queue_entries
  drop constraint if exists queue_entries_quantity_check;

alter table queue_entries
  add constraint queue_entries_quantity_check check (quantity > 0);

drop function if exists requeue_entry(date, uuid);
drop function if exists assign_queue_number(date, bigint, text, text, uuid);

create or replace function assign_queue_number(
  p_queue_date date,
  p_telegram_chat_id bigint,
  p_client_name text,
  p_client_phone text,
  p_service_id uuid,
  p_quantity int
)
returns queue_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing queue_entries;
  v_new queue_entries;
  v_next_number int;
  v_is_accepting boolean;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_quantity';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_telegram_chat_id::text || ':' || p_queue_date::text, 0)
  );

  select * into v_existing
  from queue_entries
  where queue_date = p_queue_date
    and telegram_chat_id = p_telegram_chat_id
    and status in ('waiting', 'in_service')
  order by joined_at
  limit 1
  for update;

  if v_existing.id is not null then
    return v_existing;
  end if;

  select accepting_queue into v_is_accepting
  from shop_state
  where id = true;

  if coalesce(v_is_accepting, false) is false then
    raise exception 'queue_closed';
  end if;

  insert into queue_counters (queue_date, last_number)
  values (p_queue_date, 1)
  on conflict (queue_date)
  do update set last_number = queue_counters.last_number + 1
  returning last_number into v_next_number;

  insert into queue_entries (
    queue_date, queue_number, telegram_chat_id, client_name, client_phone,
    service_id, quantity, status
  ) values (
    p_queue_date, v_next_number, p_telegram_chat_id, p_client_name,
    p_client_phone, p_service_id, p_quantity, 'waiting'
  )
  returning * into v_new;

  return v_new;
end;
$$;

create or replace function requeue_entry(
  p_queue_date date,
  p_entry_id uuid
)
returns queue_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old queue_entries;
  v_new queue_entries;
begin
  select * into v_old
  from queue_entries
  where id = p_entry_id
    and queue_date = p_queue_date
    and status = 'skipped'
  for update;

  if v_old.id is null then
    return null;
  end if;

  select * into v_new
  from assign_queue_number(
    p_queue_date,
    v_old.telegram_chat_id,
    coalesce(v_old.client_name, 'Guest'),
    coalesce(v_old.client_phone, ''),
    v_old.service_id,
    v_old.quantity
  );

  if v_new.id is null then
    return null;
  end if;

  update queue_entries
  set status = 'requeued'
  where id = p_entry_id;

  return v_new;
end;
$$;

revoke all on function assign_queue_number(date, bigint, text, text, uuid, int) from public;
revoke all on function requeue_entry(date, uuid) from public;
