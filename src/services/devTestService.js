import {
  DEV_TEST_ACCOUNTS,
  IS_DEVELOPMENT,
} from '../config/env';
import { supabase } from '../lib/supabase';

function assertDevelopment() {
  if (!IS_DEVELOPMENT) {
    throw new Error('Development account tools are unavailable in production.');
  }
}

export function getConfiguredDevAccounts() {
  assertDevelopment();
  return DEV_TEST_ACCOUNTS;
}

export async function getCurrentDevSession() {
  assertDevelopment();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;
  return session;
}

async function signInConfiguredAccount(account) {
  const {
    data: { session },
    error,
  } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });

  if (error) throw error;
  if (!session?.user) {
    throw new Error('The test account signed in without creating a session.');
  }

  return session;
}

export async function ensureCurrentDevProfile(displayName) {
  assertDevelopment();

  const { error } = await supabase.rpc('dev_ensure_test_profile', {
    p_display_name: displayName || null,
  });

  if (error) throw error;
}

export async function prepareDevTestNetwork() {
  assertDevelopment();

  const { data, error } = await supabase.rpc('dev_prepare_test_network');
  if (error) throw error;
  return data || [];
}

export async function resetDevTestRelationships() {
  assertDevelopment();

  const { data, error } = await supabase.rpc('dev_reset_test_relationships');
  if (error) throw error;
  return data || {};
}

export async function switchDevAccount(account) {
  assertDevelopment();

  if (!account?.email || !account?.password) {
    throw new Error('This development account is not fully configured.');
  }

  const previousSession = await getCurrentDevSession();
  const previousEmail = previousSession?.user?.email?.toLowerCase();
  const previousAccount = DEV_TEST_ACCOUNTS.find(
    (candidate) => candidate.email?.toLowerCase() === previousEmail
  );

  await supabase.auth.signOut();

  try {
    const session = await signInConfiguredAccount(account);
    await ensureCurrentDevProfile(account.displayName);
    const network = await prepareDevTestNetwork();

    return { session, network };
  } catch (error) {
    // Avoid leaving the tester unexpectedly signed out when the target account
    // has a typo or has not yet been created in Supabase Authentication.
    if (previousAccount) {
      try {
        await signInConfiguredAccount(previousAccount);
      } catch {
        // Preserve the original switching error below.
      }
    }

    throw error;
  }
}
