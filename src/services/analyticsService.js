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
export async function trackLaunchEvent(eventName, properties = {}) {
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
