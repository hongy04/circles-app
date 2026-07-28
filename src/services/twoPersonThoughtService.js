import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';

let thoughtRealtimeCounter = 0;

function mapThought(row = {}) {
  return {
    id: row.thought_id || row.id,
    conversationId: row.conversation_id,
    authorId: row.author_id || null,
    authorName: row.author_name || 'Someone',
    authorAvatarUrl: row.author_avatar_url || null,
    title: row.title || '',
    body: row.body || '',
    status: row.status || 'draft',
    isAuthor: Boolean(row.is_author),
    sharedAt: row.shared_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function requireThoughtsFeature() {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.TWO_PERSON_CIRCLE_THOUGHTS,
    'Write Your Thoughts is temporarily unavailable.'
  );
}

export async function listTwoPersonThoughts(conversationId) {
  await requireThoughtsFeature();
  if (!conversationId) throw new Error('Our Circle is missing.');

  const { data, error } = await supabase.rpc(
    'list_two_person_circle_thoughts',
    { p_conversation_id: conversationId }
  );
  if (error) throw error;
  return (data || []).map(mapThought);
}

export async function getTwoPersonThought(thoughtId) {
  await requireThoughtsFeature();
  if (!thoughtId) throw new Error('Thought is missing.');

  const { data, error } = await supabase.rpc(
    'get_two_person_circle_thought',
    { p_thought_id: thoughtId }
  );
  if (error) throw error;
  if (!data) throw new Error('This thought is unavailable.');
  return mapThought(data);
}

export async function createTwoPersonThoughtDraft({
  conversationId,
  title = '',
  body,
}) {
  await requireThoughtsFeature();

  const { data, error } = await supabase.rpc(
    'create_two_person_circle_thought_draft',
    {
      p_conversation_id: conversationId,
      p_title: String(title || '').trim(),
      p_body: String(body || '').trim(),
    }
  );
  if (error) throw error;
  return data;
}

export async function updateTwoPersonThoughtDraft({
  thoughtId,
  title = '',
  body,
}) {
  await requireThoughtsFeature();

  const { data, error } = await supabase.rpc(
    'update_two_person_circle_thought_draft',
    {
      p_thought_id: thoughtId,
      p_title: String(title || '').trim(),
      p_body: String(body || '').trim(),
    }
  );
  if (error) throw error;
  return mapThought(data);
}

export async function shareTwoPersonThought(thoughtId) {
  await requireThoughtsFeature();

  const { data, error } = await supabase.rpc(
    'share_two_person_circle_thought',
    { p_thought_id: thoughtId }
  );
  if (error) throw error;
  return mapThought(data);
}

export async function deleteTwoPersonThought(thoughtId) {
  await requireThoughtsFeature();

  const { data, error } = await supabase.rpc(
    'delete_two_person_circle_thought',
    { p_thought_id: thoughtId }
  );
  if (error) throw error;
  return Boolean(data);
}

export function subscribeToTwoPersonThoughtChanges({
  conversationId,
  onChange,
}) {
  if (!conversationId || typeof onChange !== 'function') return () => {};

  thoughtRealtimeCounter += 1;
  const channel = supabase
    .channel(
      `two_person_thoughts_${conversationId}_${Date.now()}_${thoughtRealtimeCounter}`
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
