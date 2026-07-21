const requestedMode = process.env.EXPO_PUBLIC_APP_MODE;

export const APP_MODE =
  requestedMode === 'production' ? 'production' : 'development';

/*
 * Development helpers are available only when BOTH conditions are true:
 * 1) EXPO_PUBLIC_APP_MODE=development
 * 2) the JavaScript bundle is running with React Native's __DEV__ flag
 *
 * This prevents release builds from exposing test login or account-switching
 * controls if an environment variable is accidentally left in development.
 */
export const IS_DEVELOPMENT = APP_MODE === 'development' && __DEV__;

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

export const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const DEV_EMAIL = process.env.EXPO_PUBLIC_DEV_EMAIL;
export const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD;
export const DEV_NAME = process.env.EXPO_PUBLIC_DEV_NAME || 'Primary Test';
export const DEV_BYPASS_CODE =
  process.env.EXPO_PUBLIC_DEV_BYPASS_CODE || '000000';
export const DEV_PHONE =
  process.env.EXPO_PUBLIC_DEV_PHONE || '+15550000000';

const DEV_ACCOUNT_2_EMAIL = process.env.EXPO_PUBLIC_DEV_ACCOUNT_2_EMAIL;
const DEV_ACCOUNT_2_PASSWORD = process.env.EXPO_PUBLIC_DEV_ACCOUNT_2_PASSWORD;
const DEV_ACCOUNT_2_NAME =
  process.env.EXPO_PUBLIC_DEV_ACCOUNT_2_NAME || 'Alex Test';

const DEV_ACCOUNT_3_EMAIL = process.env.EXPO_PUBLIC_DEV_ACCOUNT_3_EMAIL;
const DEV_ACCOUNT_3_PASSWORD = process.env.EXPO_PUBLIC_DEV_ACCOUNT_3_PASSWORD;
const DEV_ACCOUNT_3_NAME =
  process.env.EXPO_PUBLIC_DEV_ACCOUNT_3_NAME || 'Sam Test';

/**
 * Credentials are read only in local development builds. EXPO_PUBLIC values
 * are visible to the client bundle, so these accounts must contain test data
 * only and must never be reused for a real account.
 */
export const DEV_TEST_ACCOUNTS = [
  {
    key: 'primary',
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    displayName: DEV_NAME,
  },
  {
    key: 'account-2',
    email: DEV_ACCOUNT_2_EMAIL,
    password: DEV_ACCOUNT_2_PASSWORD,
    displayName: DEV_ACCOUNT_2_NAME,
  },
  {
    key: 'account-3',
    email: DEV_ACCOUNT_3_EMAIL,
    password: DEV_ACCOUNT_3_PASSWORD,
    displayName: DEV_ACCOUNT_3_NAME,
  },
].filter((account) => Boolean(account.email && account.password));

export function validatePublicEnvironment() {
  const missing = [];

  if (!SUPABASE_URL) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_KEY) {
    missing.push(
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or EXPO_PUBLIC_SUPABASE_ANON_KEY)'
    );
  }

  if (missing.length) {
    throw new Error(
      `Missing app environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
    );
  }
}

export function validateDevelopmentEnvironment() {
  if (!IS_DEVELOPMENT) return;

  const missing = [];
  if (!DEV_EMAIL) missing.push('EXPO_PUBLIC_DEV_EMAIL');
  if (!DEV_PASSWORD) missing.push('EXPO_PUBLIC_DEV_PASSWORD');

  if (missing.length) {
    throw new Error(
      `Development login is not configured. Missing: ${missing.join(', ')}`
    );
  }
}
