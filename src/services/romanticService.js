import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';

function normalizeConnection(raw = {}) {
  return {
    userId: raw.user_id,
    displayName: raw.display_name || 'Connection',
    username: raw.username || null,
    avatarUrl: raw.avatar_url || null,
    visible: Boolean(raw.visible),
  };
}

function normalizeSettings(data = {}) {
  return {
    enabled: Boolean(data.enabled),
    ageConfirmed: Boolean(data.age_confirmed),
    audienceMode:
      data.audience_mode === 'selected_connections'
        ? 'selected_connections'
        : 'all_connections',
    visibleCount: Number(data.visible_count || 0),
    connections: (data.connections || []).map(normalizeConnection),
  };
}

export async function fetchMyRomanticSettings() {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.ROMANTIC_CHANNEL_BETA,
    'Romantic settings are temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc('get_my_romantic_settings');
  if (error) throw error;

  return normalizeSettings(data);
}

export async function saveMyRomanticSettings({
  enabled,
  ageConfirmed,
  audienceMode,
}) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.ROMANTIC_CHANNEL_BETA,
    'Romantic settings are temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc('update_my_romantic_settings', {
    p_enabled: Boolean(enabled),
    p_age_confirmed: Boolean(ageConfirmed),
    p_audience_mode:
      audienceMode === 'selected_connections'
        ? 'selected_connections'
        : 'all_connections',
  });

  if (error) throw error;
  return normalizeSettings(data);
}

export async function setMyRomanticVisibility(targetUserId, visible) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.ROMANTIC_CHANNEL_BETA,
    'Romantic settings are temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc('set_my_romantic_visibility', {
    p_target_user_id: targetUserId,
    p_visible: Boolean(visible),
  });

  if (error) throw error;
  return normalizeSettings(data);
}

export async function fetchRomanticChannelStatus(otherUserId) {
  await ensureAuthed();

  try {
    await requireFeature(
      FEATURE_FLAGS.ROMANTIC_CHANNEL_BETA,
      'Romantic settings are temporarily unavailable.'
    );

    const { data, error } = await supabase.rpc('get_romantic_channel_status', {
      p_other_user_id: otherUserId,
    });

    if (error) throw error;

    return {
      available: Boolean(data?.available),
      channelOpen: Boolean(data?.channel_open),
    };
  } catch {
    // A profile must remain usable if the beta is disabled or the migration has
    // not been applied yet. Absence never explains either person's settings.
    return { available: false, channelOpen: false };
  }
}
