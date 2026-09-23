# Admin Account Setup

This guide explains how to create the admin account for the Mule Barber dashboard.

## Overview

The dashboard uses Supabase Auth with a single admin account. Authentication is handled via email/password.

## Generate Admin Password

Use a strong password generator. Here's a command:

```bash
# macOS/Linux
openssl rand -base64 32

# Windows (PowerShell)
[System.Convert]::ToBase64String([System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes(32))
```

This will output a cryptographically secure random string like:
```
xB7kL9mN2pQ5rT8vW1yZ3aC4dE6fG7hI8jK0lM2nO4pQ6rS8
```

**Save this password somewhere safe.** You'll use it to log into the dashboard.

## Create Admin User via Supabase Dashboard

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project (mule-barber-app)
3. Navigate to **Authentication** → **Users**
4. Click **+ Create new user**
5. Fill in:
   - **Email:** `admin@mulebarber.local` (or your preferred email)
   - **Password:** Paste the generated password
   - **Auto confirm user:** Toggle ON (so they don't need email verification)
6. Click **Create User**

The admin account is now ready.

## Update Environment Variables

Add these to `.env.local`:

```env
ADMIN_EMAIL=admin@mulebarber.local
ADMIN_PASSWORD=xB7kL9mN2pQ5rT8vW1yZ3aC4dE6fG7hI8jK0lM2nO4pQ6rS8
```

**Keep `.env.local` safe and never commit it.** It's in `.gitignore` for this reason.

## Test Login

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Visit `http://localhost:3000/login`

3. Sign in with:
   - Email: `admin@mulebarber.local`
   - Password: (the generated password)

4. You should be redirected to `/dashboard`

## Dashboard Features

- **Live queue view:** In-service entry at the top, waiting queue below
- **Realtime sync:** Changes appear instantly via Supabase Realtime
- **Connection status:** Visual indicator if connection is lost
- **Manual refresh:** Fallback button if needed
- **Sign out:** Button in top right

## Production Deployment

For production (Vercel, self-hosted), create the admin account the same way via the Supabase Dashboard, then update your `.env` in your hosting provider.

**Do NOT hardcode passwords in code or version control.**

## Troubleshooting

### "Invalid email or password"

- Double-check email spelling
- Ensure you toggled "Auto confirm user" when creating the account
- Try resetting the password via Supabase Dashboard (Users → Edit → Change Password)

### "Connected to database but dashboard is blank"

- Check browser DevTools Console for errors
- Ensure Realtime is enabled in your Supabase project
- Check that your RLS policies allow authenticated reads

### "Stuck on login page"

- Clear browser cookies
- Check `.env.local` has correct Supabase URL and keys
- Check network tab to see if `/api/auth/login` is responding

## Security Notes

- Admin password is only used at login; subsequent requests use Supabase session cookies
- Session cookies are secure, HttpOnly, and SameSite by default (set by Supabase)
- All dashboard data is read-only this phase (no action buttons yet)
- Service-role writes only happen via Telegram bot or Phase 4 admin actions
