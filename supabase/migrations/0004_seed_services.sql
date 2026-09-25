-- 0004_seed_services.sql — Seed default services
-- Created 2026-09-25

-- Insert the three default Mule Barber services
insert into services (name, is_active, sort_order) values
  ('Haircut', true, 1),
  ('Haircut + Beard', true, 2),
  ('Beard', true, 3)
on conflict do nothing;

-- Ensure shop state exists
insert into shop_state (id, accepting_queue) values
  (true, true)
on conflict (id) do update set accepting_queue = true;
