-- 0005_add_position_notification_flags.sql
-- Add notification flags for positions 4, 3, 2, 1

alter table queue_entries 
add column if not exists notified_pos_4 boolean not null default false;

alter table queue_entries 
add column if not exists notified_pos_3 boolean not null default false;

alter table queue_entries 
add column if not exists notified_pos_2 boolean not null default false;

alter table queue_entries 
add column if not exists notified_pos_1 boolean not null default false;
