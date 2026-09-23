-- 0002_queue_functions.sql — Atomic queue operations and seeds
-- Implements assign_queue_number() and advance_queue() as Postgres RPC functions.

-- Seed the services table with Mule Barber's offerings
insert into services (name, sort_order) values
  ('Haircut', 1),
  ('Haircut + Beard', 2),
  ('Beard', 3);

-- Ensure shop_state row exists (it should from init, but be explicit)
insert into shop_state (accepting_queue) values (true)
  on conflict (id) do nothing;

-- assign_queue_number(chat_id, client_name, service_id)
-- Atomically:
--   1. Check shop is accepting queue entries
--   2. Check no active entry exists for this chat_id today
--   3. Assign the next queue_number (max + 1)
--   4. Insert the new queue_entry
-- Returns the new entry (or null if failed due to business rules)
create or replace function assign_queue_number(
  p_telegram_chat_id bigint,
  p_client_name text,
  p_service_id uuid
)
returns json as $$
declare
  v_is_accepting boolean;
  v_existing_id uuid;
  v_next_queue_number int;
  v_new_entry_id uuid;
  v_new_entry record;
begin
  -- 1. Check if shop is accepting queue entries
  select accepting_queue into v_is_accepting from shop_state where id = true;
  if v_is_accepting is false then
    return json_build_object(
      'success', false,
      'error', 'Shop is not accepting new queue entries',
      'error_code', 'shop_closed'
    );
  end if;

  -- 2. Check for existing active entry (waiting or in_service) for this client today
  select id into v_existing_id
    from queue_entries
    where telegram_chat_id = p_telegram_chat_id
      and queue_date = current_date
      and status in ('waiting', 'in_service')
    limit 1;
  
  if v_existing_id is not null then
    return json_build_object(
      'success', false,
      'error', 'Already in queue today',
      'error_code', 'duplicate_entry',
      'existing_id', v_existing_id
    );
  end if;

  -- 3. Assign next queue number
  select coalesce(max(queue_number), 0) + 1 into v_next_queue_number
    from queue_entries
    where queue_date = current_date
      and status in ('waiting', 'in_service');

  -- 4. Insert the new queue entry
  insert into queue_entries (
    queue_number,
    queue_date,
    telegram_chat_id,
    client_name,
    service_id,
    status
  ) values (
    v_next_queue_number,
    current_date,
    p_telegram_chat_id,
    p_client_name,
    p_service_id,
    'waiting'
  )
  returning * into v_new_entry;

  return json_build_object(
    'success', true,
    'id', v_new_entry.id,
    'queue_number', v_new_entry.queue_number,
    'queue_date', v_new_entry.queue_date,
    'telegram_chat_id', v_new_entry.telegram_chat_id,
    'client_name', v_new_entry.client_name,
    'service_id', v_new_entry.service_id,
    'status', v_new_entry.status,
    'joined_at', v_new_entry.joined_at
  );
end;
$$ language plpgsql security definer;

-- advance_queue(action, entry_id)
-- Atomically transitions the queue forward:
--   - If action = 'next': mark current in_service as completed, mark next waiting as in_service
--   - If action = 'skip': mark current in_service as skipped, mark next waiting as in_service
--   - If action = 'cancel': mark specified entry as cancelled
-- Returns json with the transition result and the new in_service entry (if any)
create or replace function advance_queue(
  p_action text,
  p_entry_id uuid
)
returns json as $$
declare
  v_current_entry record;
  v_next_entry record;
  v_action_result json;
begin
  -- Validate action
  if p_action not in ('next', 'skip', 'cancel') then
    return json_build_object(
      'success', false,
      'error', 'Invalid action',
      'error_code', 'invalid_action'
    );
  end if;

  -- Get the entry being acted upon
  select * into v_current_entry
    from queue_entries
    where id = p_entry_id
      and queue_date = current_date;

  if v_current_entry is null then
    return json_build_object(
      'success', false,
      'error', 'Entry not found or not from today',
      'error_code', 'entry_not_found'
    );
  end if;

  -- Handle cancel action (simple: just mark as cancelled)
  if p_action = 'cancel' then
    update queue_entries
      set status = 'cancelled'
      where id = p_entry_id;
    
    return json_build_object(
      'success', true,
      'action', 'cancel',
      'cancelled_entry_id', p_entry_id,
      'new_in_service_entry', null
    );
  end if;

  -- For 'next' and 'skip', mark current as completed/skipped and advance the queue
  if p_action = 'next' then
    update queue_entries
      set status = 'completed', completed_at = now()
      where id = p_entry_id;
    v_action_result := json_build_object('action', 'next', 'previous_status', 'completed');
  elsif p_action = 'skip' then
    update queue_entries
      set status = 'skipped', completed_at = now()
      where id = p_entry_id;
    v_action_result := json_build_object('action', 'skip', 'previous_status', 'skipped');
  end if;

  -- Find and transition the next waiting entry to in_service
  select * into v_next_entry
    from queue_entries
    where queue_date = current_date
      and status = 'waiting'
    order by queue_number asc
    limit 1;

  if v_next_entry is not null then
    update queue_entries
      set status = 'in_service', started_at = now()
      where id = v_next_entry.id;
    
    return json_build_object(
      'success', true,
      'previous_entry', v_action_result,
      'new_in_service_entry', json_build_object(
        'id', v_next_entry.id,
        'queue_number', v_next_entry.queue_number,
        'client_name', v_next_entry.client_name,
        'service_id', v_next_entry.service_id
      )
    );
  else
    -- No more entries in queue
    return json_build_object(
      'success', true,
      'previous_entry', v_action_result,
      'new_in_service_entry', null,
      'message', 'Queue is now empty'
    );
  end if;
end;
$$ language plpgsql security definer;

-- Deny-all RLS policies: all writes go through service-role functions above
create policy "deny insert on queue_entries"
  on queue_entries for insert with check (false);

create policy "deny update on queue_entries"
  on queue_entries for update with check (false);

create policy "deny delete on queue_entries"
  on queue_entries for delete using (false);

create policy "deny insert on services"
  on services for insert with check (false);

create policy "deny update on services"
  on services for update with check (false);

create policy "deny delete on services"
  on services for delete using (false);

create policy "deny insert on shop_state"
  on shop_state for insert with check (false);

create policy "deny update on shop_state"
  on shop_state for update with check (false);

create policy "deny delete on shop_state"
  on shop_state for delete using (false);
