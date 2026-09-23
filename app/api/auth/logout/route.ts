/**
 * POST /api/auth/logout
 * Sign out the current user.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[auth/logout] error:', err);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}
