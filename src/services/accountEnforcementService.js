import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, isFeatureEnabled, requireFeature } from './featureFlagService';

let enforcementChannelCounter = 0;

function nextChannelName() {
  enforcementChannelCounter += 1;
  return `account_enforcement_${Date.now()}_${enforcementChannelCounter}`;
}

function normalizeState(data) {
  const active = Boolean(data?.active);
  return {
    active,
    state: active ? data?.state || 'restricted' : 'active',
    reasonCode: data?.reason_code || null,
    publicMessage: data?.public_message || null,
    startsAt: data?.starts_at || null,
    endsAt: data?.ends_at || null,
    isPermanent: Boolean(active && data?.is_permanent),
    sourceReportId: data?.source_report_id || null,
    updatedAt: data?.updated_at || null,
  };
}

export async function getMyAccountEnforcementState() {
  await ensureAuthed();

  const enabled = await isFeatureEnabled(FEATURE_FLAGS.SAFETY_ACCOUNT_ENFORCEMENT);
  if (!enabled) return normalizeState(null);

  const { data, error } = await supabase.rpc('get_my_account_enforcement_state');
  if (error) {
    // Keep copied clients usable before Migration 055 is installed.
    if (
      error.code === 'PGRST202'
      || /get_my_account_enforcement_state|account_enforcements/i.test(error.message || '')
    ) {
      return normalizeState(null);
    }
    throw error;
  }

  return normalizeState(data);
}

export async function getModerationAccountEnforcement(reportId) {
  await requireFeature(
    FEATURE_FLAGS.SAFETY_ACCOUNT_ENFORCEMENT,
    'Account enforcement tools are temporarily unavailable.'
  );
  await ensureAuthed();

  const { data, error } = await supabase.rpc('get_moderation_account_enforcement', {
    p_report_id: reportId,
  });
  if (error) throw error;
  return normalizeState(data);
}

export async function applyModerationAccountEnforcement({
  reportId,
  action,
  durationHours = null,
  publicMessage = '',
  internalNote = '',
}) {
  await requireFeature(
    FEATURE_FLAGS.SAFETY_ACCOUNT_ENFORCEMENT,
    'Account enforcement tools are temporarily unavailable.'
  );
  await ensureAuthed();

  const { data, error } = await supabase.rpc('apply_moderation_account_enforcement', {
    p_report_id: reportId,
    p_action: action,
    p_duration_hours: durationHours,
    p_public_message: publicMessage.trim() || null,
    p_internal_note: internalNote.trim() || null,
  });
  if (error) throw error;
  return normalizeState(data);
}

export async function subscribeToMyAccountEnforcement(onChange) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return () => {};

  const channel = supabase
    .channel(nextChannelName())
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'account_enforcements',
        filter: `user_id=eq.${userId}`,
      },
      () => onChange?.()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function formatEnforcementEnd(value) {
  if (!value) return 'Until Circles lifts it';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Temporary';
  return date.toLocaleString();
}
