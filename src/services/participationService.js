import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';

let participationRealtimeCounter = 0;

function mapPrompt(row = {}) {
  return {
    type: row.prompt_type || '',
    targetId: row.target_id || null,
    title: row.title || '',
    actorId: row.actor_id || null,
    actorName: row.actor_name || 'Someone',
    startsAt: row.starts_at || null,
    createdAt: row.created_at || null,
  };
}

export async function listCircleParticipationPrompts(conversationId) {
  await ensureAuthed();
  if (!conversationId) return [];

  const { data, error } = await supabase.rpc('get_circle_participation_prompts', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return (data || []).map(mapPrompt);
}

export async function markSharedThoughtRead(thoughtId) {
  await ensureAuthed();
  if (!thoughtId) return null;

  const { data, error } = await supabase.rpc('mark_two_person_thought_read', {
    p_thought_id: thoughtId,
  });
  if (error) throw error;
  return data || null;
}

export function subscribeToParticipationChanges({ conversationId, onChange }) {
  if (!conversationId || typeof onChange !== 'function') return () => {};

  participationRealtimeCounter += 1;
  const channel = supabase
    .channel(`circle_participation_${conversationId}_${Date.now()}_${participationRealtimeCounter}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'circle_notifications',
      },
      onChange
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'event_availability_polls',
        filter: `conversation_id=eq.${conversationId}`,
      },
      onChange
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'two_person_circle_plans',
        filter: `conversation_id=eq.${conversationId}`,
      },
      onChange
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'two_person_circle_thoughts',
        filter: `conversation_id=eq.${conversationId}`,
      },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
