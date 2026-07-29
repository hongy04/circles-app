import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';

let planRealtimeCounter = 0;

function mapPlan(row = {}) {
  return {
    id: row.plan_id || row.id,
    conversationId: row.conversation_id,
    title: row.title || 'Shared plan',
    note: row.note || '',
    locationName: row.location_name || '',
    status: row.status || 'idea',
    startsAt: row.starts_at || null,
    proposalBy: row.proposal_by || null,
    proposalByName: row.proposal_by_name || null,
    responseState: row.response_state || 'none',
    tentativeBy: row.tentative_by || null,
    tentativeByName: row.tentative_by_name || null,
    acceptedBy: row.accepted_by || null,
    acceptedByName: row.accepted_by_name || null,
    acceptedAt: row.accepted_at || null,
    completedBy: row.completed_by || null,
    completedByName: row.completed_by_name || null,
    completedAt: row.completed_at || null,
    memoryNote: row.memory_note || '',
    memoryAlbumId: row.memory_album_id || null,
    memoryPostId: row.memory_post_id || null,
    createdBy: row.created_by || null,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    isProposalMine: Boolean(row.is_proposal_mine),
    canRespond: Boolean(row.can_respond),
    canEdit: Boolean(row.can_edit),
    canComplete: Boolean(row.can_complete),
  };
}

async function requirePlansFeature() {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.TWO_PERSON_CIRCLE_PLANS,
    'Shared plans are temporarily unavailable.'
  );
}

async function requireMemoryLinksFeature() {
  await requirePlansFeature();
  await requireFeature(
    FEATURE_FLAGS.TWO_PERSON_PLAN_MEMORY_LINKS,
    'Memory links are temporarily unavailable.'
  );
}

export async function listTwoPersonPlans(conversationId) {
  await requirePlansFeature();
  if (!conversationId) throw new Error('Our Circle is missing.');

  const { data, error } = await supabase.rpc('list_two_person_circle_plans', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return (data || []).map(mapPlan);
}

export async function getTwoPersonPlan(planId) {
  await requirePlansFeature();
  if (!planId) throw new Error('Plan is missing.');

  const { data, error } = await supabase.rpc('get_two_person_circle_plan', {
    p_plan_id: planId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('This shared plan is unavailable.');
  return mapPlan(row);
}

export async function createTwoPersonPlanIdea({
  conversationId,
  title,
  note = '',
  locationName = '',
}) {
  await requirePlansFeature();

  const { data, error } = await supabase.rpc('create_two_person_plan_idea', {
    p_conversation_id: conversationId,
    p_title: String(title || '').trim(),
    p_note: String(note || '').trim(),
    p_location_name: String(locationName || '').trim(),
  });
  if (error) throw error;
  return data;
}

export async function updateTwoPersonPlanIdea({
  planId,
  title,
  note = '',
  locationName = '',
}) {
  await requirePlansFeature();

  const { data, error } = await supabase.rpc('update_two_person_plan_idea', {
    p_plan_id: planId,
    p_title: String(title || '').trim(),
    p_note: String(note || '').trim(),
    p_location_name: String(locationName || '').trim(),
  });
  if (error) throw error;
  return mapPlan(data);
}

export async function proposeTwoPersonPlan({
  planId,
  title,
  note = '',
  locationName = '',
  startsAt,
}) {
  await requirePlansFeature();
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    throw new Error('Choose a valid date and time.');
  }

  const { data, error } = await supabase.rpc('propose_two_person_plan', {
    p_plan_id: planId,
    p_title: String(title || '').trim(),
    p_note: String(note || '').trim(),
    p_location_name: String(locationName || '').trim(),
    p_starts_at: startsAt.toISOString(),
  });
  if (error) throw error;
  return mapPlan(data);
}

export async function respondToTwoPersonPlan(planId, action) {
  await requirePlansFeature();
  if (!['accept', 'tentative'].includes(action)) {
    throw new Error('Choose a valid response.');
  }

  const { data, error } = await supabase.rpc('respond_two_person_plan', {
    p_plan_id: planId,
    p_action: action,
  });
  if (error) throw error;
  return mapPlan(data);
}

export async function completeTwoPersonPlan(planId, memoryNote = '') {
  await requirePlansFeature();

  const { data, error } = await supabase.rpc('complete_two_person_plan', {
    p_plan_id: planId,
    p_memory_note: String(memoryNote || '').trim(),
  });
  if (error) throw error;
  return mapPlan(data);
}


export async function updateTwoPersonPlanMemoryAlbum(planId, albumId = null) {
  await requireMemoryLinksFeature();
  if (!planId) throw new Error('Memory is missing.');

  const { data, error } = await supabase.rpc(
    'update_two_person_plan_memory_album',
    {
      p_plan_id: planId,
      p_album_id: albumId || null,
    }
  );
  if (error) throw error;
  return mapPlan(data);
}

export async function updateTwoPersonPlanMemoryPost(planId, postId = null) {
  await requireMemoryLinksFeature();
  if (!planId) throw new Error('Memory is missing.');

  const { data, error } = await supabase.rpc(
    'update_two_person_plan_memory_post',
    {
      p_plan_id: planId,
      p_post_id: postId || null,
    }
  );
  if (error) throw error;
  return mapPlan(data);
}

export async function deleteTwoPersonPlan(planId) {
  await requirePlansFeature();

  const { data, error } = await supabase.rpc('delete_two_person_plan', {
    p_plan_id: planId,
  });
  if (error) throw error;
  return Boolean(data);
}

export function subscribeToTwoPersonPlanChanges({ conversationId, onChange }) {
  if (!conversationId || typeof onChange !== 'function') return () => {};

  planRealtimeCounter += 1;
  const channel = supabase
    .channel(`two_person_plans_${conversationId}_${Date.now()}_${planRealtimeCounter}`)
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
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
