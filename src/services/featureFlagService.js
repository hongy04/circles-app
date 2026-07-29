import { supabase } from '../lib/supabase';

export const FEATURE_FLAGS = Object.freeze({
  LAUNCH_INVITATIONS: 'launch_invitations',
  MUTUAL_PREVIEW_POSTS: 'mutual_preview_posts',
  PRECONNECTION_PROFILE_SHELL: 'preconnection_profile_shell',
  LAUNCH_ANALYTICS: 'launch_analytics',
  CIRCLE_EVENTS: 'circle_events',
  EVENT_AVAILABILITY_POLLS: 'event_availability_polls',
  MULTI_CIRCLE_EVENTS: 'multi_circle_events',
  EVENT_OUTSIDE_GUESTS: 'event_outside_guests',
  EVENT_GUEST_WEB_RSVP: 'event_guest_web_rsvp',
  EVENT_PHOTO_GALLERY: 'event_photo_gallery',
  EVENT_HISTORY: 'event_history',
  SHARED_EVENT_CONNECTIONS: 'shared_event_connections',
  GUEST_ATTENDANCE_CLAIMS: 'guest_attendance_claims',
  TRUSTED_MUTUALS_RANKING: 'trusted_mutuals_ranking',
  EVENT_REPEAT_SIGNALS: 'event_repeat_signals',
  ROMANTIC_CHANNEL_BETA: 'romantic_channel_beta',
  ROMANTIC_INTEREST_BETA: 'romantic_interest_beta',
  ROMANTIC_FOCUS_BETA: 'romantic_focus_beta',
  TWO_PERSON_CIRCLE_PROPOSALS: 'two_person_circle_proposals',
  TWO_PERSON_CIRCLE_PLANS: 'two_person_circle_plans',
  TWO_PERSON_CIRCLE_IMPORTANT_DATES: 'two_person_circle_important_dates',
  TWO_PERSON_CIRCLE_THOUGHTS: 'two_person_circle_thoughts',
  TWO_PERSON_CIRCLE_ALBUMS: 'two_person_circle_albums',
  TWO_PERSON_PLAN_MEMORY_LINKS: 'two_person_plan_memory_links',
  SAFETY_BLOCKING_REPORTING: 'safety_blocking_reporting',
  SAFETY_MODERATION_CONSOLE: 'safety_moderation_console',
  SAFETY_ACCOUNT_ENFORCEMENT: 'safety_account_enforcement',
});

const DEFAULT_FLAGS = Object.freeze({
  [FEATURE_FLAGS.LAUNCH_INVITATIONS]: true,
  [FEATURE_FLAGS.MUTUAL_PREVIEW_POSTS]: true,
  [FEATURE_FLAGS.PRECONNECTION_PROFILE_SHELL]: true,
  [FEATURE_FLAGS.LAUNCH_ANALYTICS]: true,
  [FEATURE_FLAGS.CIRCLE_EVENTS]: true,
  [FEATURE_FLAGS.EVENT_AVAILABILITY_POLLS]: true,
  [FEATURE_FLAGS.MULTI_CIRCLE_EVENTS]: true,
  [FEATURE_FLAGS.EVENT_OUTSIDE_GUESTS]: true,
  [FEATURE_FLAGS.EVENT_GUEST_WEB_RSVP]: true,
  [FEATURE_FLAGS.EVENT_PHOTO_GALLERY]: true,
  [FEATURE_FLAGS.EVENT_HISTORY]: true,
  [FEATURE_FLAGS.SHARED_EVENT_CONNECTIONS]: true,
  [FEATURE_FLAGS.GUEST_ATTENDANCE_CLAIMS]: true,
  [FEATURE_FLAGS.TRUSTED_MUTUALS_RANKING]: true,
  [FEATURE_FLAGS.EVENT_REPEAT_SIGNALS]: true,
  [FEATURE_FLAGS.ROMANTIC_CHANNEL_BETA]: true,
  [FEATURE_FLAGS.ROMANTIC_INTEREST_BETA]: true,
  [FEATURE_FLAGS.ROMANTIC_FOCUS_BETA]: true,
  [FEATURE_FLAGS.TWO_PERSON_CIRCLE_PROPOSALS]: true,
  [FEATURE_FLAGS.TWO_PERSON_CIRCLE_PLANS]: true,
  [FEATURE_FLAGS.TWO_PERSON_CIRCLE_IMPORTANT_DATES]: true,
  [FEATURE_FLAGS.TWO_PERSON_CIRCLE_THOUGHTS]: true,
  [FEATURE_FLAGS.TWO_PERSON_CIRCLE_ALBUMS]: true,
  [FEATURE_FLAGS.TWO_PERSON_PLAN_MEMORY_LINKS]: true,
  [FEATURE_FLAGS.SAFETY_BLOCKING_REPORTING]: true,
  [FEATURE_FLAGS.SAFETY_MODERATION_CONSOLE]: true,
  [FEATURE_FLAGS.SAFETY_ACCOUNT_ENFORCEMENT]: true,
});

const CACHE_TTL_MS = 60_000;
let cachedFlags = null;
let cacheExpiresAt = 0;
let pendingLoad = null;

function normalizeFlags(data) {
  return Object.keys(DEFAULT_FLAGS).reduce(
    (flags, key) => ({
      ...flags,
      [key]: typeof data?.[key] === 'boolean' ? data[key] : DEFAULT_FLAGS[key],
    }),
    {}
  );
}

export async function loadFeatureFlags({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedFlags && now < cacheExpiresAt) {
    return cachedFlags;
  }

  if (!force && pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_app_feature_flags');
      if (error) throw error;
      cachedFlags = normalizeFlags(data);
    } catch {
      // Defaults keep a newly copied client usable until migration 022 runs.
      cachedFlags = { ...DEFAULT_FLAGS };
    } finally {
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      pendingLoad = null;
    }

    return cachedFlags;
  })();

  return pendingLoad;
}

export async function isFeatureEnabled(flagKey, options) {
  const flags = await loadFeatureFlags(options);
  return flags[flagKey] !== false;
}

export async function requireFeature(flagKey, message) {
  const enabled = await isFeatureEnabled(flagKey);
  if (!enabled) {
    throw new Error(message || 'This feature is temporarily unavailable.');
  }
}

export function clearFeatureFlagCache() {
  cachedFlags = null;
  cacheExpiresAt = 0;
  pendingLoad = null;
}
