/**
 * Auth utilities for the owner dashboard.
 * Handles sign-in, sign-out, and session checks.
 */
import { createClient } from '@/lib/supabase/server';

/**
 * Get the current authenticated user session.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the current user's session.
 */
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Sign in with email and password.
 * Returns { user, error } tuple.
 */
export async function signIn(email: string, password: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { user: null, error: error.message };
  }

  return { user: data.user, error: null };
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/**
 * Check if user is authenticated.
 */
export async function isAuthenticated() {
  const user = await getCurrentUser();
  return !!user;
}
