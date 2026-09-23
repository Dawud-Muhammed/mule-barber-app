# Quick Local Setup — Add Missing Env Vars

Your `.env.local` is missing 2 critical server-side variables. Here's how to get them:

---

## Step 1: Get Supabase Service Role Key

1. Go to your **Supabase Dashboard**
2. Click **Settings** (bottom left)
3. Click **API** in the left sidebar
4. Scroll down to **Project API keys** section
5. Copy the **Service Role** key (labeled "secret")
   - It starts with `eyJhbGc...`

---

## Step 2: Generate Webhook Secret

In your terminal, run:

```bash
# macOS/Linux
openssl rand -base64 32

# Windows (PowerShell)
[Convert]::ToBase64String([System.Security.Cryptography.RNGCryptoServiceProvider]::GetBytes(32))
```

Copy the output (e.g., `abcdef1234567890...`)

---

## Step 3: Update .env.local

Add these lines to your `.env.local` file:

```bash
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...paste_your_service_role_key_here...
TELEGRAM_WEBHOOK_SECRET=paste_your_generated_secret_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Your updated .env.local should look like:**

```
NEXT_PUBLIC_SUPABASE_URL=https://btwyyxgatmbmypkmwxaw.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_51BVTcx2lPNSwbt8oe7DHw_Si3BsSjS
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...YOUR_KEY_HERE...
TELEGRAM_BOT_TOKEN=8919297117:AAGCSNtjnQKV-sA8ZgGug5TuB0xqrGxljUY
TELEGRAM_WEBHOOK_SECRET=your_random_secret_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_EMAIL=admin@mulebarber.local
ADMIN_PASSWORD=OC8B+t19GfbCI+vRVzQ3WoD6hj3KEvagd0X1bZfLWs0=
```

---

## Step 4: Restart Dev Server

```bash
npm run dev
```

You should see:
```
✓ Ready in 1234ms
```

---

## Step 5: Run Local Testing

Follow **LOCAL_TESTING_GUIDE.md** (Step 2 onwards):

1. Start ngrok → get HTTPS URL
2. Register webhook with Telegram using ngrok URL
3. Test bot `/start` → should see service options
4. Join queue from bot
5. Dashboard should show the customer
6. Click "Complete" → customer moves up
7. Notifications should be sent

---

## Need the Service Role Key?

**If you don't have access to your Supabase dashboard:**

Contact your Supabase project admin or:
1. Go to app.supabase.com
2. Login with your email
3. Select your project
4. Settings → API → Copy Service Role key

---

## Ready?

Once you've added those 3 variables and restarted `npm run dev`, follow the **LOCAL_TESTING_GUIDE.md** from Step 2 onwards.

You'll have a fully working local test environment! 🚀
