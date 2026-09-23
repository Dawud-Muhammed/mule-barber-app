# Phase 3 Complete: Dashboard with Auth & Realtime Sync

## Overview

The owner dashboard is now fully implemented with Supabase Auth, live Realtime sync, and a clean counter display. This phase provides the owner with a read-only view of the queue that updates instantly as clients join or status changes.

**Commits:**
- `6cac153` — Dashboard with Auth and Realtime
- `bcfb13c` — Telegram bot with grammy
- `6a6e348` — Schema and migrations

---

## Admin Account Setup

### Generated Password

```
OC8B+t19GfbCI+vRVzQ3WoD6hj3KEvagd0X1bZfLWs0=
```

**Keep this safe.** It's the only password for the admin account.

### Create Admin via Supabase Dashboard

1. Go to [Supabase Dashboard](https://app.supabase.com) → Your Project
2. **Authentication** → **Users** → **+ Create new user**
3. Fill in:
   - **Email:** `admin@mulebarber.local` (or your preferred email)
   - **Password:** Paste the generated password above
   - **Auto confirm user:** Toggle ON
4. Click **Create User**

### Add to .env.local

```env
ADMIN_EMAIL=admin@mulebarber.local
ADMIN_PASSWORD=OC8B+t19GfbCI+vRVzQ3WoD6hj3KEvagd0X1bZfLWs0=
```

See **ADMIN_SETUP.md** for full details and troubleshooting.

---

## Architecture

### Auth Flow

```
User visits /login
    ↓
[No session? Show form | Has session? Redirect to /dashboard]
    ↓
Enter email/password
    ↓
POST /api/auth/login → Supabase Auth
    ↓
Session cookie set (secure, HttpOnly, SameSite)
    ↓
Redirect to /dashboard
    ↓
middleware.ts checks session (validates auth on every request)
    ↓
Authenticated → render dashboard
```

### Dashboard Data Flow

```
/dashboard (client component)
    ↓
Initial load: fetch queue data (browser client)
    ↓
Subscribe to Realtime (queue_entries changes, filtered to today)
    ↓
Any change → auto-fetch + re-render (no manual refresh needed)
    ↓
Connection lost → show "reconnecting..." + backoff retry [1s, 2s, 5s, 10s]
    ↓
User can manually refresh as fallback
```

### Data Access

| Component | Client | Auth | Permission |
|-----------|--------|------|-----------|
| Dashboard reads | Browser (client.ts) | Authenticated cookies | SELECT via RLS policy |
| Telegram bot reads | Server (admin.ts) | Service role | SELECT via service role |
| Bot writes (join) | Server (admin.ts) | Service role | RPC assign_queue_number() |
| Dashboard writes | — | — | None (read-only Phase 3) |

---

## Features

### Login Page (`/login`)

- Clean dark theme with Mule Barber branding
- Email/password form with real-time validation
- Error display (invalid credentials, network issues)
- Auto-redirect authenticated users to dashboard

### Dashboard (`/dashboard`)

**In-Service Section (Top):**
- Prominent large queue number (e.g., "Queue #5")
- Client name or "Guest"
- Service name
- Time serving started
- Empty state: "Queue is empty"

**Waiting Queue:**
- List ordered by queue_number
- Each entry shows: Queue #, name, service, join time
- Card-based layout for readability
- Empty state: "Queue is empty"

**Connection Status:**
- Subtle indicator when Realtime is disconnected
- Shows "Connection lost — reconnecting..." during backoff
- Auto-retries with exponential delays (1s → 2s → 5s → 10s)
- No UI spam; progress shown discretely

**Manual Refresh:**
- Button at bottom as fallback (not primary path)
- Fetches all data and updates display

**Sign Out:**
- Button in top-right header
- Clears session, redirects to /login

---

## Security & Access Control

### Authentication
- Supabase Auth with email/password
- Sessions via secure, HttpOnly, SameSite cookies
- Middleware protection on `/dashboard` and `/login` routes

### Authorization (RLS)
- Authenticated users can SELECT queue_entries for today only
- Service-role key can call RPC functions (bypasses RLS)
- Telegram bot uses service-role for all writes
- Dashboard (client) only reads (Phase 3)

### Secrets Protection
- `.env.local` is gitignored (never committed)
- Service role key only used server-side
- Telegram bot token kept in env
- Admin password shown once during setup, then stored separately

---

## Realtime Sync Details

### Subscription Channel

- Channel name: `queue-<YYYY-MM-DD>` (scoped per day)
- Events: INSERT, UPDATE (all on queue_entries for today)
- Filter: `queue_date=eq.TODAY` via RLS
- No DELETE subscriptions (queue entries only marked completed/skipped)

### Reconnection Strategy

1. **Connection lost:** Display "reconnecting..." banner
2. **Backoff delays:** [1000ms, 2000ms, 5000ms, 10000ms]
3. **Max retries:** Unlimited (caps at final 10s delay)
4. **Recovery:** Auto-fetches all data when connection restores
5. **Manual fallback:** User can click "Refresh" if needed

### Why Realtime Over Polling?

- ✅ Instant updates (WebSocket-based)
- ✅ Efficient (only sends changes, not full data)
- ✅ Better UX (owner sees changes as they happen)
- ✅ Supabase Realtime is built for this use case
- ❌ Polling would require frequent requests + higher latency

---

## Testing

### Local Development

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Create admin account:**
   - Go to Supabase Dashboard → Authentication → Users
   - Create user with email/password (toggle auto-confirm ON)

3. **Test login:**
   - Visit `http://localhost:3000/login`
   - Sign in with credentials
   - Should redirect to dashboard

4. **Test Realtime:**
   - Open bot and join queue (`/start` → select service → confirm)
   - Watch dashboard update instantly (no page refresh)
   - Disconnect internet → see "reconnecting..." → reconnect → auto-resumes

5. **Test fallback:**
   - Click "Manual Refresh" button
   - Data updates without losing UI state

### Production Deployment

See **TELEGRAM_SETUP.md** for Vercel/VPS deployment. Dashboard works the same everywhere once auth is configured.

---

## What's Next (Phase 4)

- ✅ Auth + live sync (Phase 3 — DONE)
- ⏭️ **Dashboard actions:** Mark in-service, complete, skip, cancel entries
- ⏭️ **Client notifications:** Auto-notify at "3 ahead" and "you're next"
- ⏭️ **Owner controls:** Toggle queue open/closed

---

## Files Changed

### Auth & Middleware
- `middleware.ts` — Route protection (new)
- `lib/auth.ts` — Auth utilities (new)
- `supabase/migrations/0003_auth_admin.sql` — Auth schema (new)

### Login & Dashboard
- `app/login/page.tsx` — Login form (new)
- `app/dashboard/page.tsx` — Main dashboard (new)
- `app/api/auth/login/route.ts` — Auth endpoint (new)
- `app/api/auth/logout/route.ts` — Logout endpoint (new)

### Documentation
- `ADMIN_SETUP.md` — Admin account setup guide (new)
- `PHASE_3_SUMMARY.md` — This file (new)
- `.env.example` — Updated with admin creds (updated)

---

## Commands for Reference

### Apply migrations to Supabase

```bash
supabase migration up
# or via Supabase CLI if running locally
```

### Create admin account

```bash
# Via Supabase Dashboard (recommended)
# Auth → Users → + Create new user

# Email: admin@mulebarber.local
# Password: OC8B+t19GfbCI+vRVzQ3WoD6hj3KEvagd0X1bZfLWs0=
# Auto confirm: ON
```

### Start dev server

```bash
npm run dev
# Visit http://localhost:3000/login
```

### Build & test

```bash
npm run build
npm run start
```

---

## Known Limitations & Future Work

- **In-memory sessions:** Bot uses in-memory map (chat_id → state). Consider migrating to Supabase table if needed persistence.
- **No action buttons yet:** Dashboard is read-only; Phase 4 adds mark in-service, complete, skip, cancel.
- **No notifications:** Clients don't get auto-notified at "3 ahead" or "you're next"; Phase 4 adds this.
- **Single admin:** Design supports one admin; multi-admin possible with admin_users table expansion.
- **No audit log:** Queue transitions not logged; optional for future compliance/debugging.

---

## Support

For setup help or issues:
1. Check **ADMIN_SETUP.md** (troubleshooting section)
2. Review browser DevTools Console (dashboard logs errors there)
3. Check Supabase Dashboard → Logs for auth/RLS issues
4. Verify `.env.local` has correct Supabase URL and keys
