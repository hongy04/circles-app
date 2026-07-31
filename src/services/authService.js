import { supabase } from '../lib/supabase';

/**
 * Returns the current authenticated session or throws a user-facing error.
 * Development account selection is handled explicitly by DevSignInScreen and
 * never runs as a hidden email-verification bypass.
 */
export async function ensureAuthed() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (!session) throw new Error('Please sign in first');

  return session;
}
