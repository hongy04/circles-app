import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';

export const WHISPER_MAX_CHARACTERS = 140;
export const WHISPER_LIFETIME_HOURS = 24;
export const WHISPER_MAX_VISIBLE_INCOMING = 10;
export const WHISPER_MAX_HEADER_BUBBLES = 3;

let whisperRealtimeCounter = 0;

function normalizeSettings(data) {
  return {
    allowWhispers: data?.allow_whispers !== false,
  };
}

function normalizeEligibility(data) {
  return {
    canSend: Boolean(data?.can_send),
    reason: data?.reason || null,
    nextAllowedAt: data?.next_allowed_at || null,
  };
}

function normalizeWhisper(row) {
  return {
    id: row.whisper_id,
    senderId: row.sender_id,
    senderName: row.sender_name || 'Connection',
    senderAvatar: row.sender_avatar || null,
    body: row.body || '',
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    openedAt: row.opened_at || null,
  };
}

export async function getMyWhisperSettings() {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_my_whisper_settings');
  if (error) throw error;
  return normalizeSettings(data);
}

export async function updateMyWhisperSettings(allowWhispers) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('update_my_whisper_settings', {
    p_allow_whispers: Boolean(allowWhispers),
  });
  if (error) throw error;
  return normalizeSettings(data);
}

export async function getWhisperSendEligibility(recipientId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_whisper_send_eligibility', {
    p_recipient_id: recipientId,
  });
  if (error) throw error;
  return normalizeEligibility(data);
}

export async function sendWhisper(recipientId, body) {
  await ensureAuthed();
  const cleanBody = String(body || '').trim();
  if (!cleanBody) throw new Error('Write something to Whisper.');
  if (cleanBody.length > WHISPER_MAX_CHARACTERS) {
    throw new Error(`Whispers must be ${WHISPER_MAX_CHARACTERS} characters or fewer.`);
  }

  const { data, error } = await supabase.rpc('send_whisper', {
    p_recipient_id: recipientId,
    p_body: cleanBody,
  });
  if (error) throw error;

  return {
    sent: Boolean(data?.sent),
    whisperId: data?.whisper_id || null,
    expiresAt: data?.expires_at || null,
    nextAllowedAt: data?.next_allowed_at || null,
  };
}

export async function listMyActiveWhispers() {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_my_active_whispers');
  if (error) throw error;
  return (data || []).map(normalizeWhisper);
}

export function subscribeToWhisperPulses(recipientId, onChange) {
  if (!recipientId || typeof onChange !== 'function') return () => {};

  whisperRealtimeCounter += 1;
  const channel = supabase
    .channel(`whisper_pulses_${recipientId}_${Date.now()}_${whisperRealtimeCounter}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'profile_whisper_pulses',
        filter: `recipient_id=eq.${recipientId}`,
      },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function markWhisperOpened(whisperId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('mark_whisper_opened', {
    p_whisper_id: whisperId,
  });
  if (error) throw error;

  return {
    opened: Boolean(data?.opened),
    whisperId: data?.whisper_id || whisperId,
    senderId: data?.sender_id || null,
    body: data?.body || '',
    expiresAt: data?.expires_at || null,
  };
}

export async function consumeWhisper(whisperId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('consume_whisper', {
    p_whisper_id: whisperId,
  });
  if (error) throw error;
  return {
    consumed: Boolean(data?.consumed),
    whisperId: data?.whisper_id || whisperId,
  };
}

export async function reportWhisper({ whisperId, reason, details = '' }) {
  await ensureAuthed();
  const cleanDetails = String(details || '').trim();
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
