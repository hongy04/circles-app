const requestedMode = process.env.EXPO_PUBLIC_APP_MODE;

export const APP_MODE =
  requestedMode === 'production' ? 'production' : 'development';

/*
 * The development bypass is available only when BOTH conditions are true:
 * 1) EXPO_PUBLIC_APP_MODE=development
 * 2) the JavaScript bundle is running with React Native's __DEV__ flag
 *
 * This prevents a release build from shipping an active 000000 bypass even if
 * someone accidentally leaves the environment variable set to development.
 */
export const IS_DEVELOPMENT = APP_MODE === 'development' && __DEV__;

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

export const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const DEV_EMAIL = process.env.EXPO_PUBLIC_DEV_EMAIL;
export const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD;
export const DEV_BYPASS_CODE =
  process.env.EXPO_PUBLIC_DEV_BYPASS_CODE || '000000';
export const DEV_PHONE =
  process.env.EXPO_PUBLIC_DEV_PHONE || '+15550000000';

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
