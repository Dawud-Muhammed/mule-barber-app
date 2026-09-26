-- 0010_requeue_and_lost_status.sql
-- Remove requeued rows from Skipped today and track final lost customers.

alter table queue_entries
  drop constraint if exists queue_entries_status_check;

alter table queue_entries
  add constraint queue_entries_status_check
  check (status in ('waiting', 'in_service', 'completed', 'skipped', 'cancelled', 'requeued', 'lost'));

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
    v_old.service_id
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

revoke all on function requeue_entry(date, uuid) from public;
