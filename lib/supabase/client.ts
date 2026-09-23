/**
 * Supabase browser client.
 * Used in "use client" components to read public data (owner dashboard viewing queue).
 * Never includes the service role key.
 */
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/database';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
