-- 0008_completed_notification.sql
-- Durable one-time thank-you notification after service completion.

alter table queue_entries
  add column if not exists notified_completed boolean not null default false;
