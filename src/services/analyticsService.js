import { Platform } from 'react-native';

import { APP_MODE } from '../config/env';
import { supabase } from '../lib/supabase';

const ALLOWED_EVENT_NAMES = new Set([
  'invite_created',
  'invite_share_opened',
  'invite_previewed',
  'invite_redeemed',
  'mutuals_opened',
  'mutual_preview_updated',
  'preconnection_profile_opened',
  'connection_request_sent',
  'connection_request_responded',
  'circle_member_invites_sent',
  'event_created',
  'event_opened',
  'event_rsvp_updated',
  'event_poll_created',
  'event_poll_opened',
  'event_poll_response_updated',
  'event_poll_finalized',
  'event_guest_added',
  'event_guest_response_updated',
  'event_guest_removed',
  'event_guest_settings_updated',
]);

const ALLOWED_PROPERTY_KEYS = new Set([
  'invite_kind',
  'surface',
  'delivery',
  'outcome',
  'reason',
  'action',
  'request_state',
  'valid',
  'has_preview',
  'has_mutual_contact',
  'candidate_count',
  'request_count',
  'connection_count',
  'mutual_connection_count',
  'shared_circle_count',
  'invitation_count',
  'rsvp_status',
  'has_location',
  'has_description',
  'option_count',
  'selected_count',
  'none_available',
  'poll_status',
  'circle_count',
  'guest_type',
  'guest_status',
  'guest_cap',
  'invite_mode',
  'allow_plus_ones',
]);

function sanitizeProperties(properties = {}) {
  const clean = {};

  Object.entries(properties).forEach(([key, value]) => {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) return;
    if (!['string', 'number', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    clean[key] = value;
  });

  return {
    ...clean,
    platform: Platform.OS,
    app_mode: APP_MODE,
  };
}

/**
 * Best-effort first-party analytics. Tracking must never block or break a user
 * action, and the database RPC independently strips non-allowlisted fields.
 */
export async function trackAppEvent(eventName, properties = {}) {
  if (!ALLOWED_EVENT_NAMES.has(eventName)) return false;

  try {
    const { data, error } = await supabase.rpc('track_app_event', {
      p_event_name: eventName,
      p_properties: sanitizeProperties(properties),
    });

    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

// Backward-compatible name retained for the Phase 1 call sites.
export const trackLaunchEvent = trackAppEvent;
