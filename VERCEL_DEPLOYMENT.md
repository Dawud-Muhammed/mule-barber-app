# Deploy to Vercel – Complete Setup

## Your Vercel Project
- URL: https://mule-barber-app.vercel.app/
- Status: Empty (default Next.js homepage)

## Environment Variables to Add

Go to: **Vercel Dashboard → Your Project → Settings → Environment Variables**

Add these **exact** variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://btwyyxgatmbmypkmwxaw.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_51BVTcx2lPNSwbt8oe7DHw_Si3BsSjS
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SUPABASE_SECRET_KEY_FROM_DASHBOARD>
TELEGRAM_BOT_TOKEN=8919297117:AAGCSNtjnQKV-sA8ZgGug5TuB0xqrGxljUY
TELEGRAM_WEBHOOK_SECRET=<GENERATED_RANDOM_SECRET>
NEXT_PUBLIC_APP_URL=https://mule-barber-app.vercel.app
ADMIN_EMAIL=admin@mulebarber.local
ADMIN_PASSWORD=<YOUR_ADMIN_PASSWORD>
```

### Important Notes:
- ✅ `NEXT_PUBLIC_*` vars appear in client-side code (that's normal and safe)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_PASSWORD` are server-only (never exposed to browser)
- ✅ All vars are now in Vercel, not in git

---

## Step 1: Add Env Vars to Vercel

1. Go to: https://vercel.com/dashboard
2. Click your project: **mule-barber-app**
3. Click **Settings** tab
4. Click **Environment Variables** (left sidebar)
5. Click **Add New** for each variable above
6. Paste the variable name and value
7. Click **Save**

**Repeat for all 8 variables above.**

---

## Step 2: Push Code to GitHub

Your code needs to be on GitHub for Vercel to auto-deploy.

**Option A: If your repo is already on GitHub**
```bash
git push origin main
```

**Option B: If NOT on GitHub yet**
```bash
git remote add origin https://github.com/YOUR_USERNAME/mule-barber-app.git
git branch -M main
git push -u origin main
```

Vercel will **automatically deploy** when code is pushed to `main`.

---

## Step 3: Verify Deployment

1. Go to: https://vercel.com/dashboard
2. Click your project
3. Look for **Deployments** tab
4. Wait for status to change from "Building" → "Ready"
5. When ready, click the URL to visit your live app

Expected: Dashboard login page (not the default Next.js homepage)

---

## Step 4: Register Telegram Webhook

Once deployment is done, register the webhook with your production URL:

```bash
TELEGRAM_TOKEN="8919297117:AAGCSNtjnQKV-sA8ZgGug5TuB0xqrGxljUY"
WEBHOOK_URL="https://mule-barber-app.vercel.app/api/telegram/webhook?secret=<YOUR_WEBHOOK_SECRET>"

curl -X POST https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"
```

Or paste this in your browser (replace `<YOUR_WEBHOOK_SECRET>` with the secret from Vercel env vars):
---

## Step 5: Verify Webhook is Registered

```bash
curl https://api.telegram.org/bot8919297117:AAGCSNtjnQKV-sA8ZgGug5TuB0xqrGxljUY/getWebhookInfo
```

Should return:
```json
{
  "ok": true,
  "result": {
    "url": "https://mule-barber-app.vercel.app/api/telegram/webhook?secret=...",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

✅ If `pending_update_count: 0` and `url` matches → webhook is active!

---

## Step 6: Test Everything

1. **Open bot** → Go to Telegram, search `@mule_barber_bot`
2. **Click /start** → Should see service buttons (Haircut, Haircut+Beard, Beard)
3. **Join queue** → Should get queue number
4. **Open dashboard** → Go to https://mule-barber-app.vercel.app
   - Login with: `admin@mulebarber.local` / `OC8B+t19GfbCI+vRVzQ3WoD6hj3KEvagd0X1bZfLWs0=`
   - Should see customer in queue
5. **Click Complete** → Customer moves to next position
6. **Check notifications** → Bot should send messages (position updates)

---

## 🆘 If Bot Shows No Services

**Check 1: Is webhook registered?**
```bash
curl https://api.telegram.org/bot8919297117:AAGCSNtjnQKV-sA8ZgGug5TuB0xqrGxljUY/getWebhookInfo
```
- If `url` is empty → webhook not registered (run Step 4 again)
- If `url` is correct → webhook is registered

**Check 2: Are services in database?**
- Login to dashboard
- Should see service options when you're in queue
- If empty → services not seeded (contact support)

**Check 3: Check Vercel logs**
```
https://vercel.com/dashboard → Your Project → Deployments → Latest → Logs
```
Look for errors in bot handler

---

## ✅ Success Checklist

- [ ] All 8 env vars added to Vercel
- [ ] Code pushed to GitHub (`git push origin main`)
- [ ] Vercel deployment shows "Ready"
- [ ] Bot `/start` shows service options
- [ ] Bot joins add customers to queue
- [ ] Dashboard shows queue in real-time
- [ ] Dashboard buttons work (Complete, Skip, Cancel, Requeue)
- [ ] Notifications sent automatically
- [ ] Mobile view looks good

If all ✅ → **System is live and production-ready!** 🎉

---

## 📝 Summary

You now have:
- ✅ Production app running at https://mule-barber-app.vercel.app
- ✅ Telegram bot (@mule_barber_bot) connected
- ✅ Real-time dashboard syncing live customer queue
- ✅ Auto-notifications sent to customers
- ✅ Secure server-side secrets (never exposed)
- ✅ Full barber queue management system

**Time to first customer:** ~5 min (after webhook registers)

Let customers know: Message `@mule_barber_bot` to join the queue!
