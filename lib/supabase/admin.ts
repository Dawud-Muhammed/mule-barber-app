/**
 * Supabase admin client (service role).
 * Server-only. NEVER imported from a "use client" file.
 * Used for all queue mutations (joins, transitions, transitions, status updates).
 * Bypasses RLS by design — use only in server code you control.
 */
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

// Only safe to call in server contexts (Server Components, Route Handlers, API routes).
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. This client can only be used server-side.');
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
