import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';

function normalizeAgeEligibility(data = {}) {
  return {
    dateOfBirthSet: Boolean(data.date_of_birth_set),
    dateOfBirth: data.date_of_birth || null,
    eligibleForRomance: Boolean(data.eligible_for_romance),
    eligibleOn: data.eligible_on || null,
    locked: Boolean(data.locked),
  };
}

export async function fetchMyAgeEligibility() {
  await ensureAuthed();

  const { data, error } = await supabase.rpc('get_my_age_eligibility');
  if (error) throw error;
  return normalizeAgeEligibility(data);
}

export async function saveMyDateOfBirth(dateOfBirth) {
  await ensureAuthed();

  const { data, error } = await supabase.rpc('set_my_date_of_birth', {
    p_date_of_birth: dateOfBirth,
  });

  if (error) throw error;
  return normalizeAgeEligibility(data);
}
