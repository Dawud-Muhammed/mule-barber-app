-- 0001_init.sql — Mule Barber base schema
-- Created 2026-09-23

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0
);
alter table services enable row level security;

-- Single-row state table so the owner toggle is data, not env vars.
create table shop_state (
  id boolean primary key default true,
  accepting_queue boolean not null default true,
  constraint single_row check (id = true)
);
alter table shop_state enable row level security;

create table queue_entries (
  id uuid primary key default gen_random_uuid(),
  queue_number int not null,
  queue_date date not null default current_date,
  telegram_chat_id bigint not null,
  client_name text,
  service_id uuid references services(id),
  status text not null default 'waiting'
    check (status in ('waiting','in_service','completed','skipped','cancelled')),
  notified_close boolean not null default false,
  notified_next boolean not null default false,
  joined_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
alter table queue_entries enable row level security;

-- Read-only policies: the authenticated owner reads via the browser client + Realtime.
-- All writes go through service-role RPC functions (see 0002_queue_functions.sql).
create policy "owner can read services"
  on services for select to authenticated using (true);

create policy "owner can read todays queue"
  on queue_entries for select to authenticated
  using (queue_date = current_date);

create policy "owner can read shop state"
  on shop_state for select to authenticated using (true);

-- THE duplicate-join backstop. App logic checks too, but this is the guarantee:
-- at most one active ('waiting' or 'in_service') row per client per day.
create unique index one_active_entry_per_client
  on queue_entries (telegram_chat_id, queue_date)
  where status in ('waiting','in_service');

-- Hot path for dashboard + position lookups.
create index queue_entries_live_idx
  on queue_entries (queue_date, status, queue_number);