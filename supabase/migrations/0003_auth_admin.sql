-- 0003_auth_admin.sql — Supabase Auth setup and admin account
-- This migration creates the admin user via Supabase Auth.
-- The user ID will be stored and linked to admin policies later if needed.

-- Note: Direct SQL INSERT into auth.users is not recommended in production.
-- For local dev, Supabase handles this via the dashboard or CLI.
-- In production, use the Supabase management API or Dashboard UI.

-- For now, this migration documents the admin setup.
-- The actual user creation happens in: bin/seed-admin.ts

-- Create an admin_users table to track admin permissions (optional, for future multi-admin)
create table if not exists admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now(),
  last_login timestamptz
);

alter table admin_users enable row level security;

-- Only the admin user can read their own row
create policy "admin can read own row"
  on admin_users for select to authenticated
  using (auth.uid() = id);
