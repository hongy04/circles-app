import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, isFeatureEnabled, requireFeature } from './featureFlagService';

export const REPORT_STATUS_LABELS = Object.freeze({
  submitted: 'Submitted',
  reviewing: 'Under review',
  resolved: 'Resolved',
  dismissed: 'Closed',
});

export const REPORT_SEVERITIES = Object.freeze([
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]);

export const REPORT_RESOLUTIONS = Object.freeze([
  { value: 'no_action', label: 'No action' },
  { value: 'warning_issued', label: 'Warning issued' },
  { value: 'content_removed', label: 'Content removed' },
  { value: 'account_restricted', label: 'Record external restriction', seniorOnly: true },
  { value: 'account_suspended', label: 'Record external suspension', seniorOnly: true },
  { value: 'escalated', label: 'Escalated', seniorOnly: true },
  { value: 'duplicate', label: 'Duplicate report' },
]);

async function requireModerationFeature() {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.SAFETY_MODERATION_CONSOLE,
    'Safety review tools are temporarily unavailable.'
  );
}

export async function getModerationAccess() {
  await ensureAuthed();

  const enabled = await isFeatureEnabled(FEATURE_FLAGS.SAFETY_MODERATION_CONSOLE);
  if (!enabled) return { hasAccess: false, role: null };

  const { data, error } = await supabase.rpc('get_moderation_access');
  if (error) {
    // Settings must stay usable before Migration 053 is installed.
    if (error.code === 'PGRST202' || /get_moderation_access/i.test(error.message || '')) {
      return { hasAccess: false, role: null };
    }
    throw error;
  }

  return {
    hasAccess: Boolean(data?.has_access),
    role: data?.role || null,
  };
}

export async function fetchMyReportReceipts() {
  await requireModerationFeature();
  const { data, error } = await supabase.rpc('get_my_report_receipts');
  if (error) throw error;

  return (data || []).map((row) => ({
    reportId: row.report_id,
    reason: row.reason,
    sourceContext: row.source_context,
    status: row.status,
    resolutionCode: row.resolution_code || null,
    publicResolutionMessage: row.public_resolution_message || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function fetchModerationQueue({
  status = null,
  severity = null,
  limit = 50,
  offset = 0,
} = {}) {
  await requireModerationFeature();
  const { data, error } = await supabase.rpc('get_moderation_report_queue', {
    p_status: status,
    p_severity: severity,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;

  return (data || []).map((row) => ({
    reportId: row.report_id,
    status: row.status,
    severity: row.severity || null,
    reason: row.reason,
    sourceContext: row.source_context,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reporterDisplayName: row.reporter_display_name,
    reporterUsername: row.reporter_username || null,
    reportedDisplayName: row.reported_display_name,
    reportedUsername: row.reported_username || null,
    reportedAvatarUrl: row.reported_avatar_url || null,
    assignedModeratorId: row.assigned_moderator_id || null,
    openReportsAgainstTarget: Number(row.open_reports_against_target || 0),
  }));
}

export async function fetchModerationReport(reportId) {
  await requireModerationFeature();
  const { data, error } = await supabase.rpc('get_moderation_report_detail', {
    p_report_id: reportId,
  });
  if (error) throw error;

  return {
    reportId: data?.report_id,
    status: data?.status,
    severity: data?.severity || null,
    reason: data?.reason,
    details: data?.details || '',
    sourceContext: data?.source_context,
    createdAt: data?.created_at,
    updatedAt: data?.updated_at,
    reviewedAt: data?.reviewed_at || null,
    resolvedAt: data?.resolved_at || null,
    resolutionCode: data?.resolution_code || null,
    publicResolutionMessage: data?.public_resolution_message || '',
    internalNote: data?.internal_note || '',
    assignedModeratorId: data?.assigned_moderator_id || null,
    reporter: {
      userId: data?.reporter?.user_id,
      displayName: data?.reporter?.display_name || 'Reporter',
      username: data?.reporter?.username || null,
      avatarUrl: data?.reporter?.avatar_url || null,
    },
    reportedAccount: {
      userId: data?.reported_account?.user_id,
      displayName: data?.reported_account?.display_name || 'Reported account',
      username: data?.reported_account?.username || null,
      avatarUrl: data?.reported_account?.avatar_url || null,
    },
    openReportsAgainstTarget: Number(data?.open_reports_against_target || 0),
  };
}

export async function updateModerationReport({
  reportId,
  status,
  severity = null,
  resolutionCode = null,
  publicResolutionMessage = '',
  internalNote = '',
  assignToSelf = true,
}) {
  await requireModerationFeature();

  const { data, error } = await supabase.rpc('update_moderation_report', {
    p_report_id: reportId,
    p_status: status,
    p_severity: severity,
    p_resolution_code: resolutionCode,
    p_public_resolution_message: publicResolutionMessage.trim() || null,
    p_internal_note: internalNote.trim() || null,
    p_assign_to_self: Boolean(assignToSelf),
  });
  if (error) throw error;
  return data;
}
