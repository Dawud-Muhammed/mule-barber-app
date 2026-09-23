# Local Testing Guide — Before Production

Follow these steps to test the entire system locally before deploying to production.

---

## Prerequisites

✅ Node.js installed  
✅ Telegram bot created (have your token from BotFather)  
✅ Supabase project set up (have URL + keys)  
✅ `.env.local` filled with all credentials  

---

## Step 1: Start Local Development Server

```bash
npm install
npm run dev
```

You should see:
```
✓ Ready in 1234ms
- Local: http://localhost:3000
```

---

## Step 2: Expose Localhost with ngrok

In a **new terminal**:

```bash
# Install ngrok (if not already installed)
brew install ngrok  # macOS
# or download from ngrok.com

# Start ngrok
ngrok http 3000
```

You'll see output like:
```
Forwarding    https://abc123.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)

---

## Step 3: Register Telegram Webhook (Local)

In a **third terminal**, register the webhook with your bot token and ngrok URL:

```bash
export TELEGRAM_TOKEN="your-bot-token"
export WEBHOOK_SECRET="your-random-secret"
export NGROK_URL="https://abc123.ngrok.io"

curl -X POST https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${NGROK_URL}/api/telegram/webhook?secret=${WEBHOOK_SECRET}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"
```

Expected response:
```json
{"ok": true, "result": true, "description": "Webhook was set"}
```

---

## Step 4: Check Webhook Status

```bash
curl https://api.telegram.org/bot${TELEGRAM_TOKEN}/getWebhookInfo | jq
```

Expected:
```json
{
  "ok": true,
  "result": {
    "url": "https://abc123.ngrok.io/api/telegram/webhook?secret=...",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## Step 5: Test the Bot (Telegram)

Open **Telegram** and message your bot:

1. **Message:** `/start`
   - ✅ You should see a list of services as buttons
   - ✅ Services: "Haircut", "Haircut + Beard", "Beard"

2. **Click a service** (e.g., "Haircut")
   - ✅ You should see: "Ready to join for Haircut?"
   - ✅ Two buttons: "✓ Join Queue" and "✗ Cancel"

3. **Click "✓ Join Queue"**
   - ✅ You should see: "✅ Joined! Queue #1 — 0 ahead"
   - ✅ Button: "📍 Check my position"

4. **Click "📍 Check my position"**
   - ✅ You should see: "📋 Queue #1 — You're next!"

**If you see these responses, the bot is working!**

---

## Step 6: Test the Dashboard

1. **Open browser:** `http://localhost:3000/login`

2. **Sign in:**
   - Email: `admin@mulebarber.local`
   - Password: `OC8B+t19GfbCI+vRVzQ3WoD6hj3KEvagd0X1bZfLWs0=`

3. **You should see:**
   - "Now Serving" card showing your queue entry
   - Queue #1 with your name (or "Guest")
   - "Haircut" service name
   - Buttons: "✓ Complete Customer" and "⊘ Skip (No-show)"

---

## Step 7: Test Realtime Sync

**In Telegram:**
1. Message the bot again
2. Click `/start`
3. Select a service and join

**In Dashboard:**
- ✅ **Watch it update in real-time without refresh!**
- ✅ New customer appears in "Waiting" queue
- ✅ You should now see 2 people in the queue

---

## Step 8: Test Complete Action

**In Dashboard:**
1. Click "✓ Complete Customer" on person #1

**In Dashboard:**
- ✅ Person #1 should disappear from in-service
- ✅ Person #2 should move to "Now Serving"
- ✅ "Waiting" queue should be empty

**In Telegram (with second account):**
- ✅ Second customer should get notification: "🎯 You're up next!"

---

## Step 9: Test with Multiple Customers

**Test with 2+ Telegram accounts** (you can use the bot with multiple accounts):

1. **Account 1:** Join queue
2. **Account 2:** Join queue
3. **Account 3:** Join queue
4. **In Dashboard:**
   - ✅ Should show Account 1 in "Now Serving"
   - ✅ Should show Account 2, 3 in "Waiting"

5. **Complete Account 1:**
   - ✅ Account 2 moves to "Now Serving"
   - ✅ Account 2 gets notification "You're up next!"
   - ✅ Account 3 still waiting

6. **Account 3 gets notification at position 2:**
   - ✅ Account 3 should get "Getting close!" (pos ≤ 3)

---

## Step 10: Test Notification Failures & Recovery

**Simulate a failed notification:**

1. In your bot's Telegram settings, block the bot temporarily:
   - Message your bot: `/start` → Join
   - In Telegram settings, block @mule_barber_bot

2. **In Dashboard:**
   - ✅ You should see ⚠️ next to the customer (notification failed)

3. **Unblock the bot** and complete another customer:
   - ✅ Next action retries the notification
   - ✅ ⚠️ disappears when notification succeeds

---

## Step 11: Test Error Handling

**Try wrong credentials:**
1. Visit `http://localhost:3000/login`
2. Email: `admin@mulebarber.local`
3. Password: `wrongpassword`

**Expected:** "Incorrect password." (human-friendly message, not a Firebase error code)

---

## Step 12: Test Responsive Design

**Mobile View:**
1. Open Dashboard in Chrome DevTools
2. Click toggle device toolbar (Cmd+Shift+M / Ctrl+Shift+M)
3. Select "iPhone 12" (375px width)

**Expected:**
- ✅ Queue card is readable
- ✅ Buttons are large enough to tap
- ✅ Text doesn't overflow
- ✅ Layout is vertical stack

---

## Troubleshooting

### Bot shows no services on /start

**Check:**
1. Is the dev server running? (`npm run dev`)
2. Is ngrok running? (ngrok http 3000)
3. Is the webhook registered? (run setWebhook command)
4. Are services in the database?

```bash
# Check services are seeded
# In Supabase Dashboard → Table editor → services
# Should show: Haircut, Haircut + Beard, Beard
```

### Dashboard shows no queue entries

**Check:**
1. Did you join the queue from Telegram?
2. Is Realtime working? (Connection status should say "Connected")
3. Are you signed in as admin?

### Notifications not sending

**Check:**
1. Do you see `[notification]` logs in the dev server terminal?
2. Is your Telegram account valid?
3. Try: `curl https://api.telegram.org/bot<TOKEN>/getMe` (should return your bot info)

### ngrok URL keeps changing

**Solution:** Each time you restart ngrok, you get a new URL. You need to:
1. Get new ngrok URL
2. Run setWebhook again with new URL
3. Test bot again

Or use **ngrok fixed URL** (paid feature) to keep the same URL.

---

## Full Test Checklist

- [ ] Dev server running (`npm run dev`)
- [ ] ngrok running (`ngrok http 3000`)
- [ ] Webhook registered (setWebhook successful)
- [ ] Bot /start shows services
- [ ] Bot joins queue successfully
- [ ] Dashboard login works
- [ ] Dashboard shows queue in real-time
- [ ] Complete action works
- [ ] Realtime sync updates without refresh
- [ ] Notifications sent (or ⚠️ shown if failed)
- [ ] Multiple customers work correctly
- [ ] Error messages are human-friendly
- [ ] Mobile view is responsive
- [ ] Connection recovery works (disconnect/reconnect ngrok)

---

## Ready for Production?

Once all checkboxes above are ✅, your system is ready to deploy to Vercel:

1. Update `.env.local` with production Supabase/bot credentials
2. Push to GitHub (`git push origin main`)
3. Vercel auto-deploys
4. Register webhook with production URL
5. Test one more time with production URL
6. Go live!

---

## Pro Tips

- **Keep ngrok running:** Don't close the ngrok terminal while testing
- **Watch server logs:** `npm run dev` terminal shows all bot messages, notifications, errors
- **Use multiple accounts:** Telegram lets you sign in with different numbers to test multiple clients
- **Check DevTools Network:** Browser DevTools → Network tab → see all API calls (verify no secrets)
- **Monitor notifications:** Look for `[notification]` logs in dev server terminal

---

## Questions?

If something doesn't work:
1. Check the **troubleshooting** section above
2. Look at **dev server logs** (terminal running `npm run dev`)
3. Check **browser console** (F12 in dashboard)
4. Verify **webhook is registered**: `getWebhookInfo` should show your ngrok URL
5. Verify **services are seeded**: Supabase Dashboard → services table

You'll find the issue! 🔍
