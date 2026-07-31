import {
  DEV_TEST_ACCOUNTS,
  IS_DEVELOPMENT,
} from '../config/env';
import { supabase } from '../lib/supabase';
import { unregisterCurrentPushDevice } from './pushNotificationService';

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


async function getCurrentAccountEnforcement() {
  const { data, error } = await supabase.rpc('get_my_account_enforcement_state');

  if (error) {
    // Keep development switching compatible before enforcement migrations exist.
    if (
      error.code === 'PGRST202'
      || /get_my_account_enforcement_state|account_enforcements/i.test(error.message || '')
    ) {
      return { active: false, state: 'active' };
    }
    throw error;
  }

  return {
    active: Boolean(data?.active),
    state: data?.active ? data?.state || 'restricted' : 'active',
  };
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

  await unregisterCurrentPushDevice({ bestEffort: true });
  await supabase.auth.signOut();

  try {
    const session = await signInConfiguredAccount(account);
    const enforcement = await getCurrentAccountEnforcement();

    // Restricted and suspended accounts must still be switchable for testing,
    // but their enforcement boundary intentionally blocks setup mutations.
    if (enforcement.active) {
      return { session, network: [], enforcement };
    }

    await ensureCurrentDevProfile(account.displayName);
    const network = await prepareDevTestNetwork();

    return { session, network, enforcement };
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
