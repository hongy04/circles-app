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
    dateOfBirthSet: Boolean(data.date_of_birth_set),
    ageEligible: Boolean(data.eligible_for_romance),
    eligibleOn: data.eligible_on || null,
    audienceMode:
      data.audience_mode === 'selected_connections'
        ? 'selected_connections'
        : 'all_connections',
    visibleCount: Number(data.visible_count || 0),
    focusPaused: Boolean(data.focus_paused),
    focusActive: Boolean(data.focus_active),
    connections: (data.connections || []).map(normalizeConnection),
  };
}

function normalizeInterestStatus(data = {}) {
  return {
    available: Boolean(data.available),
    channelOpen: Boolean(data.channel_open),
    selectedByMe: Boolean(data.selected_by_me),
    mutualRevealed: Boolean(data.mutual_revealed),
    focusAvailable: Boolean(data.focus_available),
    focusSelectedByMe: Boolean(data.focus_selected_by_me),
    focusMutualRevealed: Boolean(data.focus_mutual_revealed),
    focusActive: Boolean(data.focus_active),
  };
}

function normalizeTwoPersonCircleProposalStatus(data = {}) {
  const state = typeof data.state === 'string'
    ? data.state
    : 'unavailable';

  return {
    available: Boolean(data.available),
    state,
    canPropose: Boolean(data.can_propose),
    accepted: Boolean(data.accepted),
    focusActive: Boolean(data.focus_active),
    circleEnabled: Boolean(data.circle_enabled),
    existingCircle: Boolean(data.existing_circle),
    reopening: Boolean(data.reopening),
    circleLocked: Boolean(data.circle_locked),
    circleAccessActive: Boolean(data.circle_access_active),
    conversationId: data.conversation_id || null,
    proposedAt: data.proposed_at || null,
    respondedAt: data.responded_at || null,
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
  audienceMode,
}) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.ROMANTIC_CHANNEL_BETA,
    'Romantic settings are temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc('update_my_romantic_settings', {
    p_enabled: Boolean(enabled),
    // Kept for RPC signature compatibility. The database now derives age
    // eligibility from the account owner's private saved birth date.
    p_age_confirmed: false,
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

export async function fetchRomanticInterestStatus(otherUserId) {
  await ensureAuthed();

  try {
    await requireFeature(
      FEATURE_FLAGS.ROMANTIC_CHANNEL_BETA,
      'Romantic settings are temporarily unavailable.'
    );
    await requireFeature(
      FEATURE_FLAGS.ROMANTIC_INTEREST_BETA,
      'Romantic interest is temporarily unavailable.'
    );
  } catch {
    return normalizeInterestStatus();
  }

  try {
    const { data, error } = await supabase.rpc(
      'get_romantic_interest_status',
      { p_other_user_id: otherUserId }
    );

    if (error) throw error;
    return normalizeInterestStatus(data);
  } catch {
    // Keep profiles usable in the brief copy-before-migration window. The
    // Phase 4A fallback exposes only the reciprocal channel result and never a
    // one-sided interest choice.
    try {
      const { data, error } = await supabase.rpc(
        'get_romantic_channel_status',
        { p_other_user_id: otherUserId }
      );
      if (error) throw error;
      return normalizeInterestStatus(data);
    } catch {
      return normalizeInterestStatus();
    }
  }
}

// Backward-compatible Phase 4A name retained for existing call sites.
export const fetchRomanticChannelStatus = fetchRomanticInterestStatus;

export async function setMyRomanticInterest(targetUserId, selected) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.ROMANTIC_CHANNEL_BETA,
    'Romantic settings are temporarily unavailable.'
  );
  await requireFeature(
    FEATURE_FLAGS.ROMANTIC_INTEREST_BETA,
    'Romantic interest is temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc('set_my_romantic_interest', {
    p_target_user_id: targetUserId,
    p_selected: Boolean(selected),
  });

  if (error) throw error;
  return normalizeInterestStatus(data);
}


export async function setMyRomanticFocus(targetUserId, selected) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.ROMANTIC_FOCUS_BETA,
    'Romantic Focus is temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc('set_my_romantic_focus', {
    p_target_user_id: targetUserId,
    p_selected: Boolean(selected),
  });

  if (error) throw error;
  return normalizeInterestStatus(data);
}

export async function openRomanticFocusReveal(conversationId) {
  await ensureAuthed();

  try {
    await requireFeature(
      FEATURE_FLAGS.ROMANTIC_FOCUS_BETA,
      'Romantic Focus is temporarily unavailable.'
    );

    const { data, error } = await supabase.rpc(
      'open_romantic_focus_reveal',
      { p_conversation_id: conversationId }
    );

    if (error) throw error;

    return {
      focusActive: Boolean(data?.focus_active),
      shouldReveal: Boolean(data?.should_reveal),
      activatedAt: data?.activated_at || null,
    };
  } catch {
    // Focus state must never prevent a private conversation from opening.
    return {
      focusActive: false,
      shouldReveal: false,
      activatedAt: null,
    };
  }
}

export async function resumeMyRomanticDiscovery() {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.ROMANTIC_FOCUS_BETA,
    'Romantic Focus is temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc(
    'resume_my_romantic_discovery'
  );

  if (error) throw error;
  return normalizeSettings(data);
}

export async function openRomanticMutualReveal(conversationId) {
  await ensureAuthed();

  try {
    await requireFeature(
      FEATURE_FLAGS.ROMANTIC_INTEREST_BETA,
      'Romantic interest is temporarily unavailable.'
    );

    const { data, error } = await supabase.rpc(
      'open_romantic_mutual_reveal',
      { p_conversation_id: conversationId }
    );

    if (error) throw error;

    return {
      mutualActive: Boolean(data?.mutual_active),
      shouldReveal: Boolean(data?.should_reveal),
      activatedAt: data?.activated_at || null,
    };
  } catch {
    // Romantic state must never prevent a private conversation from opening.
    return {
      mutualActive: false,
      shouldReveal: false,
      activatedAt: null,
    };
  }
}

export async function fetchTwoPersonCircleProposalStatus(otherUserId) {
  await ensureAuthed();

  try {
    await requireFeature(
      FEATURE_FLAGS.TWO_PERSON_CIRCLE_PROPOSALS,
      'Two-person Circle proposals are temporarily unavailable.'
    );

    const { data, error } = await supabase.rpc(
      'get_two_person_circle_proposal_status',
      { p_other_user_id: otherUserId }
    );

    if (error) throw error;
    return normalizeTwoPersonCircleProposalStatus(data);
  } catch {
    // Profiles remain usable before Migration 044 is applied or when the
    // proposal feature is remotely disabled.
    return normalizeTwoPersonCircleProposalStatus();
  }
}

export async function proposeTwoPersonCircle(targetUserId) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.TWO_PERSON_CIRCLE_PROPOSALS,
    'Two-person Circle proposals are temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc(
    'propose_two_person_circle',
    { p_target_user_id: targetUserId }
  );

  if (error) throw error;
  return normalizeTwoPersonCircleProposalStatus(data);
}

export async function respondToTwoPersonCircleProposal(
  otherUserId,
  action
) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.TWO_PERSON_CIRCLE_PROPOSALS,
    'Two-person Circle proposals are temporarily unavailable.'
  );

  const normalizedAction = action === 'accept'
    ? 'accept'
    : action === 'not_yet'
      ? 'not_yet'
      : 'end_focus';

  const { data, error } = await supabase.rpc(
    'respond_two_person_circle_proposal',
    {
      p_other_user_id: otherUserId,
      p_action: normalizedAction,
    }
  );

  if (error) throw error;
  return normalizeTwoPersonCircleProposalStatus(data);
}

