import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';

export const AGE_CORRECTION_STATUS_LABELS = Object.freeze({
  submitted: 'Submitted',
  reviewing: 'Under review',
  resolved: 'Resolved',
});

export const AGE_CORRECTION_RESOLUTION_LABELS = Object.freeze({
  approved: 'Correction approved',
  denied: 'Correction not approved',
});

function normalizeOwnerRequest(data = {}) {
  return {
    birthDateSet: Boolean(data.birth_date_set),
    currentDateOfBirth: data.current_date_of_birth || null,
    canSubmit: Boolean(data.can_submit),
    hasRequest: Boolean(data.has_request),
    requestId: data.request_id || null,
    requestedDateOfBirth: data.requested_date_of_birth || null,
    reason: data.reason || '',
    status: data.status || null,
    resolutionCode: data.resolution_code || null,
    publicResolutionMessage: data.public_resolution_message || null,
    submittedAt: data.submitted_at || null,
    updatedAt: data.updated_at || null,
    resolvedAt: data.resolved_at || null,
  };
}

function normalizeQueueRow(row = {}) {
  return {
    requestId: row.request_id,
    status: row.status,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    accountDisplayName: row.account_display_name || 'Account owner',
    accountUsername: row.account_username || null,
    accountAvatarUrl: row.account_avatar_url || null,
  };
}

function normalizeDetail(data = {}) {
  return {
    requestId: data.request_id,
    status: data.status,
    currentDateOfBirth: data.current_date_of_birth || null,
    requestedDateOfBirth: data.requested_date_of_birth || null,
    reason: data.reason || '',
    resolutionCode: data.resolution_code || null,
    publicResolutionMessage: data.public_resolution_message || null,
    internalNote: data.internal_note || null,
    assignedModeratorId: data.assigned_moderator_id || null,
    submittedAt: data.submitted_at || null,
    updatedAt: data.updated_at || null,
    resolvedAt: data.resolved_at || null,
    account: {
      userId: data.account?.user_id || null,
      displayName: data.account?.display_name || 'Account owner',
      username: data.account?.username || null,
      avatarUrl: data.account?.avatar_url || null,
    },
  };
}

export async function fetchMyAgeCorrectionRequest() {
  await requireFeature(
    FEATURE_FLAGS.SAFETY_AGE_CORRECTIONS,
    'Birth-date correction requests are temporarily unavailable.'
  );
  await ensureAuthed();

  const { data, error } = await supabase.rpc('get_my_age_correction_request');
  if (error) throw error;
  return normalizeOwnerRequest(data);
}

export async function submitMyAgeCorrectionRequest({ requestedDateOfBirth, reason }) {
  await requireFeature(
    FEATURE_FLAGS.SAFETY_AGE_CORRECTIONS,
    'Birth-date correction requests are temporarily unavailable.'
  );
  await ensureAuthed();

  const { data, error } = await supabase.rpc('submit_age_correction_request', {
    p_requested_date_of_birth: requestedDateOfBirth,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  return data;
}

export async function fetchModerationAgeCorrectionQueue({ status = 'submitted', limit = 50, offset = 0 } = {}) {
  await requireFeature(
    FEATURE_FLAGS.SAFETY_AGE_CORRECTIONS,
    'Birth-date correction review is temporarily unavailable.'
  );
  await ensureAuthed();

  const { data, error } = await supabase.rpc('get_moderation_age_correction_queue', {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data || []).map(normalizeQueueRow);
}

export async function fetchModerationAgeCorrectionDetail(requestId) {
  await requireFeature(
    FEATURE_FLAGS.SAFETY_AGE_CORRECTIONS,
    'Birth-date correction review is temporarily unavailable.'
  );
  await ensureAuthed();

  const { data, error } = await supabase.rpc('get_moderation_age_correction_detail', {
    p_request_id: requestId,
  });
  if (error) throw error;
  return normalizeDetail(data);
}

export async function resolveModerationAgeCorrection({
  requestId,
  decision,
  publicMessage = '',
  internalNote = '',
}) {
  await requireFeature(
    FEATURE_FLAGS.SAFETY_AGE_CORRECTIONS,
    'Birth-date correction review is temporarily unavailable.'
  );
  await ensureAuthed();

  const { data, error } = await supabase.rpc('resolve_moderation_age_correction_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_public_message: publicMessage.trim() || null,
    p_internal_note: internalNote.trim() || null,
  });
  if (error) throw error;
  return data;
}
