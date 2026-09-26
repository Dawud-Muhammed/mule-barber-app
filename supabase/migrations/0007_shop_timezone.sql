-- 0007_shop_timezone.sql
-- Align database current_date with the shop's configured timezone.

alter database postgres set timezone to 'Africa/Addis_Ababa';

drop policy if exists "owner can read todays queue" on queue_entries;
create policy "owner can read todays queue"
  on queue_entries for select to authenticated
  using (queue_date = current_date);
