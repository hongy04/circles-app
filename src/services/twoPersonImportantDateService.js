import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';

let importantDateRealtimeCounter = 0;

export const IMPORTANT_DATE_CATEGORIES = Object.freeze([
  'anniversary',
  'birthday',
  'trip',
  'tradition',
  'meaningful',
]);

export const IMPORTANT_DATE_RECURRENCES = Object.freeze(['none', 'yearly']);

function mapImportantDate(row = {}) {
  return {
    id: row.important_date_id || row.id,
    conversationId: row.conversation_id,
    title: row.title || 'Important date',
    note: row.note || '',
    dateValue: row.date_value || null,
    category: row.category || 'meaningful',
    recurrence: row.recurrence || 'none',
    createdBy: row.created_by || null,
    createdByName: row.created_by_name || null,
    updatedBy: row.updated_by || null,
    updatedByName: row.updated_by_name || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function requireImportantDatesFeature() {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.TWO_PERSON_CIRCLE_IMPORTANT_DATES,
    'Important dates are temporarily unavailable.'
  );
}

export async function listTwoPersonImportantDates(conversationId) {
  await requireImportantDatesFeature();
  if (!conversationId) throw new Error('Our Circle is missing.');

  const { data, error } = await supabase.rpc(
    'list_two_person_circle_important_dates',
    { p_conversation_id: conversationId }
  );
  if (error) throw error;
  return (data || []).map(mapImportantDate);
}

export async function getTwoPersonImportantDate(importantDateId) {
  await requireImportantDatesFeature();
  if (!importantDateId) throw new Error('Important date is missing.');

  const { data, error } = await supabase.rpc(
    'get_two_person_circle_important_date',
    { p_important_date_id: importantDateId }
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('This important date is unavailable.');
  return mapImportantDate(row);
}

export async function createTwoPersonImportantDate({
  conversationId,
  title,
  note = '',
  dateValue,
  category = 'meaningful',
  recurrence = 'none',
}) {
  await requireImportantDatesFeature();

  const { data, error } = await supabase.rpc(
    'create_two_person_circle_important_date',
    {
      p_conversation_id: conversationId,
      p_title: String(title || '').trim(),
      p_note: String(note || '').trim(),
      p_date_value: dateValue,
      p_category: category,
      p_recurrence: recurrence,
    }
  );
  if (error) throw error;
  return data;
}

export async function updateTwoPersonImportantDate({
  importantDateId,
  title,
  note = '',
  dateValue,
  category = 'meaningful',
  recurrence = 'none',
}) {
  await requireImportantDatesFeature();

  const { data, error } = await supabase.rpc(
    'update_two_person_circle_important_date',
    {
      p_important_date_id: importantDateId,
      p_title: String(title || '').trim(),
      p_note: String(note || '').trim(),
      p_date_value: dateValue,
      p_category: category,
      p_recurrence: recurrence,
    }
  );
  if (error) throw error;
  return mapImportantDate(data);
}

export async function deleteTwoPersonImportantDate(importantDateId) {
  await requireImportantDatesFeature();

  const { data, error } = await supabase.rpc(
    'delete_two_person_circle_important_date',
    { p_important_date_id: importantDateId }
  );
  if (error) throw error;
  return Boolean(data);
}

export function subscribeToTwoPersonImportantDateChanges({
  conversationId,
  onChange,
}) {
  if (!conversationId || typeof onChange !== 'function') return () => {};

  importantDateRealtimeCounter += 1;
  const channel = supabase
    .channel(
      `two_person_important_dates_${conversationId}_${Date.now()}_${importantDateRealtimeCounter}`
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'two_person_circle_important_dates',
        filter: `conversation_id=eq.${conversationId}`,
      },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
