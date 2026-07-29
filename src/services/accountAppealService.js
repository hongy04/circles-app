import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';

export const APPEAL_STATUS_LABELS = Object.freeze({
  submitted: 'Submitted',
  reviewing: 'Under review',
  resolved: 'Resolved',
});

export const APPEAL_RESOLUTION_LABELS = Object.freeze({
  upheld: 'Account action upheld',
  lifted: 'Account action lifted',
  shortened: 'Account action shortened',
  changed_to_restriction: 'Suspension changed to restriction',
  no_longer_active: 'Account action no longer active',
});

export const APPEAL_DECISIONS = Object.freeze([
  { value: 'uphold', label: 'Uphold action' },
  { value: 'lift', label: 'Lift action' },
  { value: 'shorten', label: 'Shorten action' },
  { value: 'change_to_restriction', label: 'Change to restriction' },
  { value: 'close_inactive', label: 'Close — no longer active' },
]);

async function requireAppealsFeature() {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.SAFETY_ACCOUNT_APPEALS,
    'Account appeals are temporarily unavailable.'
  );
}

function normalizeOwnerAppeal(data) {
  return {
    hasActiveEnforcement: Boolean(data?.has_active_enforcement),
    currentEnforcementState: data?.current_enforcement_state || null,
    currentEnforcementStartedAt: data?.current_enforcement_started_at || null,
    canSubmit: Boolean(data?.can_submit),
    hasAppeal: Boolean(data?.has_appeal),
    appealId: data?.appeal_id || null,
    appealText: data?.appeal_text || '',
    status: data?.status || null,
    resolutionCode: data?.resolution_code || null,
    publicResolutionMessage: data?.public_resolution_message || '',
    submittedAt: data?.submitted_at || null,
    updatedAt: data?.updated_at || null,
    resolvedAt: data?.resolved_at || null,
    matchesCurrentEnforcement: Boolean(data?.matches_current_enforcement),
  };
}

export async function getMyAccountEnforcementAppeal() {
  await requireAppealsFeature();
  const { data, error } = await supabase.rpc('get_my_account_enforcement_appeal');
  if (error) throw error;
  return normalizeOwnerAppeal(data);
}

export async function submitMyAccountEnforcementAppeal(appealText) {
  await requireAppealsFeature();
  const { data, error } = await supabase.rpc('submit_account_enforcement_appeal', {
    p_appeal_text: appealText.trim(),
  });
  if (error) throw error;
  return data;
}

export async function fetchModerationAppealQueue({
  status = 'submitted',
  limit = 50,
  offset = 0,
} = {}) {
  await requireAppealsFeature();
  const { data, error } = await supabase.rpc('get_moderation_enforcement_appeal_queue', {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;

  return (data || []).map((row) => ({
    appealId: row.appeal_id,
    status: row.status,
    enforcementState: row.enforcement_state,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    accountDisplayName: row.account_display_name || 'Account owner',
    accountUsername: row.account_username || null,
    accountAvatarUrl: row.account_avatar_url || null,
    sourceReportId: row.source_report_id || null,
    assignedModeratorId: row.assigned_moderator_id || null,
    enforcementActive: Boolean(row.enforcement_active),
  }));
}

export async function fetchModerationAppealDetail(appealId) {
  await requireAppealsFeature();
  const { data, error } = await supabase.rpc('get_moderation_enforcement_appeal_detail', {
    p_appeal_id: appealId,
  });
  if (error) throw error;

  return {
    appealId: data?.appeal_id,
    status: data?.status,
    appealText: data?.appeal_text || '',
    enforcementState: data?.enforcement_state,
    enforcementStartedAt: data?.enforcement_started_at,
    sourceReportId: data?.source_report_id || null,
    submittedAt: data?.submitted_at,
    updatedAt: data?.updated_at,
    resolvedAt: data?.resolved_at || null,
    resolutionCode: data?.resolution_code || null,
    publicResolutionMessage: data?.public_resolution_message || '',
    internalNote: data?.internal_note || '',
    assignedModeratorId: data?.assigned_moderator_id || null,
    account: {
      userId: data?.account?.user_id,
      displayName: data?.account?.display_name || 'Account owner',
      username: data?.account?.username || null,
      avatarUrl: data?.account?.avatar_url || null,
    },
    currentEnforcement: {
      active: Boolean(data?.current_enforcement?.active),
      state: data?.current_enforcement?.state || 'active',
      reasonCode: data?.current_enforcement?.reason_code || null,
      publicMessage: data?.current_enforcement?.public_message || '',
      startsAt: data?.current_enforcement?.starts_at || null,
      endsAt: data?.current_enforcement?.ends_at || null,
    },
  };
}

export async function resolveModerationAppeal({
  appealId,
  decision,
  durationHours = null,
  publicMessage = '',
  internalNote = '',
}) {
  await requireAppealsFeature();
  const { data, error } = await supabase.rpc('resolve_moderation_enforcement_appeal', {
    p_appeal_id: appealId,
    p_decision: decision,
    p_duration_hours: durationHours,
    p_public_message: publicMessage.trim() || null,
    p_internal_note: internalNote.trim() || null,
  });
  if (error) throw error;
  return data;
}
