-- 0011_seed_campus_fast_food.sql
-- Reset service catalog for the campus fast-food queue.
-- Auth users and bot language preferences are preserved.

truncate table queue_entries, queue_counters restart identity cascade;

delete from services;

insert into services (name, name_am, is_active, sort_order) values
  ('Special Ertib', 'ልዩ እርጥብ', true, 1),
  ('Normal Ertib', 'መደበኛ እርጥብ', true, 2);

insert into shop_state (id, accepting_queue)
values (true, true)
on conflict (id) do update set accepting_queue = true;
