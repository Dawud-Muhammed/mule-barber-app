# Telegram Bot Setup & Deployment Guide

## Overview

The Mule Barber bot is built with [grammy](https://grammy.dev) and runs serverless via Next.js webhook route (`/api/telegram/webhook`). No separate bot process needed.

## Environment Variables

Add these to `.env.local` (see `.env.example` for placeholders):

```env
TELEGRAM_BOT_TOKEN=<bot_token_from_botfather>
TELEGRAM_WEBHOOK_SECRET=<random_secret_you_create>
NEXT_PUBLIC_APP_URL=<your_app_url>
```

## Local Testing with ngrok

### 1. Install ngrok

Download from [ngrok.com](https://ngrok.com/download) or use a package manager:

```bash
# macOS/Homebrew
brew install ngrok

# Windows (with chocolatey)
choco install ngrok

# Or download directly
```

### 2. Start the Next.js dev server

```bash
npm run dev
```

The app runs on `http://localhost:3000` by default.

### 3. Expose localhost with ngrok

In a new terminal:

```bash
ngrok http 3000
```

This outputs a public HTTPS URL like:
```
Forwarding    https://abc123.ngrok.io -> http://localhost:3000
```

Copy the forwarding URL (e.g., `https://abc123.ngrok.io`).

### 4. Set the Telegram webhook

Using the ngrok URL and your webhook secret, register the webhook with Telegram:

```bash
curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://abc123.ngrok.io/api/telegram/webhook?secret=<YOUR_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```

Replace:
- `<YOUR_BOT_TOKEN>` with your Telegram bot token
- `abc123.ngrok.io` with your actual ngrok URL
- `<YOUR_WEBHOOK_SECRET>` with the secret from `.env.local`

**Expected response:**
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

### 5. Test the bot

Open Telegram and message your bot with `/start`. You should see the service menu.

**Webhook logs** appear in your dev server terminal.

---

## Production Deployment

### Option 1: Deploy to Vercel (Recommended)

1. Push your code to GitHub:

```bash
git push origin main
```

2. Connect to [Vercel](https://vercel.com):
   - Import your GitHub repo
   - Add environment variables (copy from `.env.local`)
   - Deploy

3. Once deployed, set the production webhook:

```bash
curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-vercel-domain>.vercel.app/api/telegram/webhook?secret=<YOUR_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```

### Option 2: Self-Hosted (VPS/Docker)

Build the project and run:

```bash
npm run build
npm run start
```

Use a reverse proxy (nginx/Caddy) to expose the app over HTTPS with your domain.

Set the webhook to:
```
https://<your-domain>.com/api/telegram/webhook?secret=<YOUR_WEBHOOK_SECRET>
```

---

## Webhook Secret Validation

The webhook validates the secret before grammy processes any request:

1. **Authorization Header (Bearer token):**
   ```
   Authorization: Bearer <secret>
   ```

2. **Query Parameter:**
   ```
   /api/telegram/webhook?secret=<secret>
   ```

3. **Custom Header:**
   ```
   X-Telegram-Webhook-Secret: <secret>
   ```

If secret is missing or invalid, the endpoint returns `401 Unauthorized`.

---

## Debugging

### Check webhook status:

```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo | jq
```

Expected output shows your webhook URL, certificate status, and last error (if any).

### Reset webhook (if stuck):

```bash
curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook
```

Then set it again.

### View logs

- **Local (dev server):** Check your terminal running `npm run dev`
- **Vercel:** Check the [Vercel Dashboard](https://vercel.com) → Function Logs
- **Self-hosted:** Check application logs (e.g., `systemctl logs`, Docker logs)

---

## Bot Commands

### `/start`

Shows the service menu with inline buttons. Selecting a service displays a confirmation dialog.

### Any text message

- If user is **in queue:** shows their current position
- If user is **not in queue:** shows the service menu again

### Inline buttons

- **Service name:** Selects that service for joining
- **✓ Join Queue:** Confirms and joins (calls `assign_queue_number()`)
- **✗ Cancel:** Returns to service menu
- **📍 Check my position:** Shows current queue number and count ahead

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Already in queue | "You're already in the queue! Queue #X — Y ahead" |
| Queue closed | "We're not taking walk-ins right now. Check back later!" |
| Not in queue (check position) | "You're not currently in the queue. Use /start to join!" |
| Database error | "Could not join queue. Please try again later." |

---

## Architecture

```
Telegram User
    ↓
/api/telegram/webhook
    ↓
[Secret validation (401 if invalid)]
    ↓
grammy bot handlers
    ├─ /start → getActiveServices() → show menu
    ├─ service_<id> callback → confirm service
    ├─ confirm_join callback → joinQueue() RPC
    ├─ check_position callback → checkPosition() query
    └─ text → check position or show menu
    ↓
Supabase (RPC functions + queries)
    ├─ assign_queue_number() RPC
    ├─ queue_entries table
    └─ services table
```

## Next Steps

1. **For production:** Deploy to Vercel or your VPS
2. **Real users:** Set webhook to production URL
3. **Owner dashboard:** Build `/dashboard` (Phase 2)
4. **Notifications:** Implement auto-notifications at "3 ahead" and "you're next" (Phase 3)
