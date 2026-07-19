import {
  DEV_EMAIL,
  DEV_PASSWORD,
  DEV_PHONE,
  IS_DEVELOPMENT,
  validateDevelopmentEnvironment,
} from '../config/env';
import { supabase } from '../lib/supabase';

/**
 * Signs into the dedicated development account.
 *
 * This function is intentionally unavailable in production mode. It does not
 * silently create a new account because email confirmation settings can make
 * that behavior unreliable and because production should never create a dev
 * user from the client.
 */
export async function ensureDevSession(phone = DEV_PHONE) {
  if (!IS_DEVELOPMENT) return null;

  validateDevelopmentEnvironment();

  const {
    data: { session: currentSession },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (currentSession) return currentSession;

  const {
    data: { session },
    error: signInError,
  } = await supabase.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  });

  if (signInError) {
    throw new Error(
      `Development sign-in failed: ${signInError.message}. Confirm that ${DEV_EMAIL} exists, is confirmed, and Email auth is enabled.`
    );
  }

  if (!session?.user) {
    throw new Error('Development sign-in completed without creating a session.');
  }

  const { error: ensureUserError } = await supabase.rpc('ensure_user', {
    phone: phone || DEV_PHONE,
  });

  if (ensureUserError) throw ensureUserError;

  return session;
}

/**
 * Returns the current authenticated session or throws a user-facing error.
 * This never invokes the development bypass automatically.
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
