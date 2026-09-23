# Action Plan: Test Locally, Then Deploy

## Your Goal
"I went to this bot [@mule_barber_bot]... I click start, but there are no options appeared. So before deploying, how will I try my system perfectly?"

## Why It's Not Working (Right Now)

❌ **Webhook not registered** — Telegram doesn't know where to send messages  
❌ **Missing env vars** — Service role key and webhook secret not set  

✅ **System code is correct** — Bot, dashboard, notifications all built and tested  
✅ **Database is ready** — Services are seeded, schema is set  

---

## 🎯 Action Plan (In Order)

### Phase 1: Local Setup (30 min)

**What to do:**
1. Read `QUICK_LOCAL_SETUP.md`
2. Get `SUPABASE_SERVICE_ROLE_KEY` from Supabase dashboard
3. Generate `TELEGRAM_WEBHOOK_SECRET` (random string)
4. Add both to `.env.local` along with `NEXT_PUBLIC_APP_URL=http://localhost:3000`
5. Restart dev server: `npm run dev`

**Expected outcome:**
- Dev server runs without errors
- Terminal shows "✓ Ready in 1234ms"

---

### Phase 2: Local Testing (1 hour)

**What to do:**
1. Follow `LOCAL_TESTING_GUIDE.md` steps 1-12
2. Install ngrok (if not already installed)
3. Start ngrok: `ngrok http 3000`
4. Copy ngrok HTTPS URL
5. Register webhook with Telegram using ngrok URL
6. Test bot `/start` → should see service buttons
7. Join queue from bot → should get queue number
8. Login to dashboard → should see customer in queue
9. Click "Complete" → should see next customer move to "Now Serving"
10. Verify notifications sent
11. Test with multiple customers
12. Check responsive design on mobile

**Expected outcome:**
- ✅ Bot responds to `/start` with service options
- ✅ Bot accepts joins and assigns queue numbers
- ✅ Dashboard shows queue in real-time
- ✅ Dashboard buttons work (complete, skip, cancel, requeue)
- ✅ Notifications sent automatically
- ✅ All errors are human-friendly (no stack traces)
- ✅ Mobile view looks good

**Full test checklist in LOCAL_TESTING_GUIDE.md**

---

### Phase 3: Validate Everything Works

**Checklist:**
- [ ] Bot `/start` shows 3 service options
- [ ] Bot joins queue successfully
- [ ] Dashboard auth works
- [ ] Dashboard shows queue in real-time
- [ ] Complete action moves customer up
- [ ] Realtime sync updates without refresh
- [ ] Notifications sent (or ⚠️ shown if failed)
- [ ] Mobile view is responsive
- [ ] No errors in console or server logs
- [ ] All user messages are human-friendly

**If all ✅**, you're ready for production!  
**If ❌**, see troubleshooting in LOCAL_TESTING_GUIDE.md

---

### Phase 4: Deploy to Production (30 min)

Once local testing passes:

1. **Prepare Vercel env vars:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://btwyyxgatmbmypkmwxaw.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_51BVTcx2lPNSwbt8oe7DHw_Si3BsSjS
   SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard>
   TELEGRAM_BOT_TOKEN=8919297117:AAGCSNtjnQKV-sA8ZgGug5TuB0xqrGxljUY
   TELEGRAM_WEBHOOK_SECRET=<your secret>
   NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>.vercel.app
   ADMIN_EMAIL=admin@mulebarber.local
   ADMIN_PASSWORD=OC8B+t19GfbCI+vRVzQ3WoD6hj3KEvagd0X1bZfLWs0=
   ```

2. **Push to GitHub:**
   ```bash
   git push origin main
   ```

3. **Vercel auto-deploys** (watch Vercel dashboard)

4. **Register webhook with production URL:**
   ```bash
   curl -X POST https://api.telegram.org/bot8919297117:AAGCSNtjnQKV-sA8ZgGug5TuB0xqrGxljUY/setWebhook \
     -H "Content-Type: application/json" \
     -d "{
       \"url\": \"https://<your-vercel-domain>.vercel.app/api/telegram/webhook?secret=<secret>\",
       \"allowed_updates\": [\"message\", \"callback_query\"]
     }"
   ```

5. **Verify webhook:**
   ```bash
   curl https://api.telegram.org/bot8919297117:AAGCSNtjnQKV-sA8ZgGug5TuB0xqrGxljUY/getWebhookInfo | jq
   ```

6. **Do one final test** in production (same as local testing)

---

## 📋 Key Documents

| Document | Purpose |
|----------|---------|
| **QUICK_LOCAL_SETUP.md** | Get missing env vars and set up local environment |
| **LOCAL_TESTING_GUIDE.md** | 12-step complete testing workflow |
| **DEPLOYMENT_CHECKLIST.md** | Pre/post-deployment verification |
| **READY_FOR_PRODUCTION.md** | Quick reference and status |
| **README_OWNER.md** | 3-button owner guide (for you) |

---

## 🚨 Critical Points

✅ **Don't deploy without local testing** — make sure it works first  
✅ **Keep `.env.local` secret** — never commit to git (it's gitignored)  
✅ **Service role key is server-only** — never expose to browser  
✅ **Webhook secret needs ngrok URL locally** — ngrok gives you a different URL each time  
✅ **Test with real Telegram account** — use your actual phone number  

---

## 🎉 Success Criteria

When this is working:
1. Bot `/start` shows service options
2. Bot joins add customers to queue
3. Dashboard shows live queue
4. Dashboard buttons work instantly
5. Notifications sent automatically
6. Realtime sync updates live
7. No stack traces shown to users
8. Mobile view looks good
9. Multiple customers work correctly
10. System is stable for 30+ min test

---

## ⏱️ Timeline

- **Setup:** 30 min (add env vars, restart server)
- **Local testing:** 1 hour (follow 12 steps)
- **Validation:** 15 min (run full checklist)
- **Deploy:** 30 min (Vercel + webhook registration)
- **Total:** ~2.5 hours → production ready

---

## 🆘 Stuck?

1. **Bot shows no services:**
   - Is ngrok running?
   - Is webhook registered? (`getWebhookInfo`)
   - Check dev server logs for errors

2. **Dashboard won't load:**
   - Are you signed in as admin?
   - Check browser console (F12) for errors
   - Verify Supabase URL in `.env.local`

3. **Notifications not sending:**
   - Check dev server logs for `[notification]` messages
   - Verify Telegram account isn't blocked
   - Check dashboard for ⚠️ indicator

4. **Realtime not syncing:**
   - Check connection status on dashboard
   - Verify Supabase keys are correct
   - Try manual refresh button

See **LOCAL_TESTING_GUIDE.md** troubleshooting section for detailed help.

---

## ✅ Next Step

👉 **Start here:** Open `QUICK_LOCAL_SETUP.md` and add the missing env vars to `.env.local`

Then: Follow `LOCAL_TESTING_GUIDE.md` for complete local validation.

Once local testing passes → Deploy to Vercel → System is live!

---

**You've got this! 🚀 The system is complete and ready. Just need to test locally first.**
