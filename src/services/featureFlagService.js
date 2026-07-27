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
