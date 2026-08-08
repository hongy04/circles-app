import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';

export const REPORT_REASONS = Object.freeze([
  {
    value: 'harassment_or_bullying',
    label: 'Harassment or bullying',
    description: 'Threats, intimidation, repeated insults, or targeted abuse.',
  },
  {
    value: 'unwanted_romantic_contact',
    label: 'Unwanted romantic contact',
    description: 'Pressure, repeated advances, or misuse of romantic features.',
  },
  {
    value: 'impersonation',
    label: 'Impersonation',
    description: 'Pretending to be you or another real person.',
  },
  {
    value: 'spam_or_scam',
    label: 'Spam or scam',
    description: 'Unwanted promotion, deceptive links, or attempted fraud.',
  },
  {
    value: 'safety_concern',
    label: 'Safety concern',
    description: 'Content or behavior that may put someone at risk.',
  },
  {
    value: 'other',
    label: 'Something else',
    description: 'Another violation that does not fit the options above.',
  },
]);

async function requireSafetyFeature() {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.SAFETY_BLOCKING_REPORTING,
    'Safety controls are temporarily unavailable.'
  );
}

export async function blockUser(userId, surface = 'profile') {
  await requireSafetyFeature();

  const { data, error } = await supabase.rpc('block_user', {
    p_target_user_id: userId,
    p_surface: surface,
  });

  if (error) throw error;
  return data || { blocked: true };
}

export async function unblockUser(userId) {
  await requireSafetyFeature();

  const { data, error } = await supabase.rpc('unblock_user', {
    p_target_user_id: userId,
  });

  if (error) throw error;
  return data || { unblocked: true, connection_restored: false };
}

export async function fetchBlockedAccounts() {
  await requireSafetyFeature();

  const { data, error } = await supabase.rpc('get_my_blocked_accounts');
  if (error) throw error;

  return (data || []).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name || 'Blocked account',
    username: row.username || null,
    avatarUrl: row.avatar_url || null,
    blockedAt: row.blocked_at || null,
  }));
}

export async function submitUserReport({
  userId,
  reason,
  details = '',
  sourceContext = 'profile',
}) {
  await requireSafetyFeature();

  const cleanDetails = details.trim();
  if (!reason) throw new Error('Choose a reason for the report.');
  if (cleanDetails.length > 2000) {
    throw new Error('Report details must be 2000 characters or fewer.');
  }

  const { data, error } = await supabase.rpc('submit_user_report', {
    p_reported_user_id: userId,
    p_reason: reason,
    p_details: cleanDetails || null,
    p_source_context: sourceContext,
  });

  if (error) throw error;
  return data || { submitted: true };
}


export async function submitWhisperSafetyReport({
  whisperId,
  reason,
  details = '',
}) {
  await requireSafetyFeature();

  const cleanDetails = details.trim();
  if (!reason) throw new Error('Choose a reason for the report.');
  if (cleanDetails.length > 1600) {
    throw new Error('Report details must be 1600 characters or fewer.');
  }

  const { data, error } = await supabase.rpc('submit_whisper_report', {
    p_whisper_id: whisperId,
    p_reason: reason,
    p_details: cleanDetails || null,
  });

  if (error) throw error;
  return data || { submitted: true, whisper_consumed: true };
}
