-- 0006_atomic_queue_and_notifications.sql
-- Atomic queue allocation/transitions and durable notification state.

alter table queue_entries
  add column if not exists client_phone text,
  add column if not exists notification_error text,
  add column if not exists notified_promoted boolean not null default false,
  add column if not exists notified_terminal boolean not null default false,
  add column if not exists notified_cancelled boolean not null default false,
  add column if not exists notified_skipped boolean not null default false;

create table if not exists queue_counters (
  queue_date date primary key,
  last_number int not null default 0
);

alter table queue_counters enable row level security;

-- Remove the old JSON contracts so all callers use explicit dates and rows.
drop function if exists assign_queue_number(bigint, text, uuid);
drop function if exists advance_queue(text, uuid);

create or replace function assign_queue_number(
  p_queue_date date,
  p_telegram_chat_id bigint,
  p_client_name text,
  p_client_phone text,
  p_service_id uuid
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
  -- Serialize retries from the same client before checking for an active row.
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
    service_id, status
  ) values (
    p_queue_date, v_next_number, p_telegram_chat_id, p_client_name,
    p_client_phone, p_service_id, 'waiting'
  )
  returning * into v_new;

  return v_new;
end;
$$;

create or replace function start_service(p_queue_date date)
returns queue_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current queue_entries;
  v_next queue_entries;
begin
  select * into v_current
  from queue_entries
  where queue_date = p_queue_date
    and status = 'in_service'
  order by started_at, queue_number
  limit 1
  for update;

  if v_current.id is not null then
    return v_current;
  end if;

  select * into v_next
  from queue_entries
  where queue_date = p_queue_date
    and status = 'waiting'
  order by queue_number
  limit 1
  for update;

  if v_next.id is null then
    return null;
  end if;

  update queue_entries
  set status = 'in_service', started_at = now()
  where id = v_next.id
  returning * into v_next;

  return v_next;
end;
$$;

create or replace function advance_queue(
  p_queue_date date,
  p_current_entry_id uuid,
  p_new_status text
)
returns queue_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current queue_entries;
  v_next queue_entries;
begin
  if p_new_status not in ('completed', 'skipped') then
    raise exception 'invalid_status';
  end if;

  select * into v_current
  from queue_entries
  where id = p_current_entry_id
  for update;

  if v_current.id is null
    or v_current.queue_date <> p_queue_date
    or v_current.status <> 'in_service' then
    return null;
  end if;

  update queue_entries
  set status = p_new_status, completed_at = now()
  where id = p_current_entry_id;

  select * into v_next
  from queue_entries
  where queue_date = p_queue_date
    and status = 'waiting'
  order by queue_number
  limit 1
  for update;

  if v_next.id is null then
    return null;
  end if;

  update queue_entries
  set status = 'in_service', started_at = now()
  where id = v_next.id
  returning * into v_next;

  return v_next;
end;
$$;

create or replace function toggle_accepting_queue()
returns shop_state
language sql
security definer
set search_path = public
as $$
  update shop_state
  set accepting_queue = not accepting_queue
  where id = true
  returning *;
$$;

-- Keep the new notification columns available to the service-role RPC path.
revoke all on function assign_queue_number(date, bigint, text, text, uuid) from public;
revoke all on function start_service(date) from public;
revoke all on function advance_queue(date, uuid, text) from public;
revoke all on function toggle_accepting_queue() from public;
