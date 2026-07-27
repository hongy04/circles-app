import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';

function normalizeEvent(raw = {}) {
  return {
    id: raw.id,
    title: raw.title || 'Event',
    startsAt: raw.starts_at || null,
    endsAt: raw.ends_at || null,
    locationName: raw.location_name || '',
    hostName: raw.host_name || 'Host',
    rsvpStatus: raw.rsvp_status || null,
    circleNames: Array.isArray(raw.circle_names) ? raw.circle_names : [],
    photoCount: Number(raw.photo_count || 0),
    completed: Boolean(raw.completed),
    accessMode: raw.access_mode || 'shared_history',
  };
}

function normalizePerson(raw = {}) {
  return {
    userId: raw.user_id,
    displayName: raw.display_name || 'Connection',
    username: raw.username || null,
    avatarUrl: raw.avatar_url || null,
  };
}

export async function fetchProfileSocialStats(userId) {
  const session = await ensureAuthed();
  const profileUserId = userId || session.user.id;

  const { data, error } = await supabase.rpc('get_profile_social_stats', {
    p_profile_user_id: profileUserId,
  });

  if (error) throw error;

  return {
    mode: data?.mode || 'self',
    postCount: Number(data?.post_count || 0),
    eventCount: Number(data?.event_count || 0),
    connectionCount: Number(data?.connection_count || 0),
  };
}

export async function fetchProfileEventDirectory(userId) {
  const session = await ensureAuthed();
  const profileUserId = userId || session.user.id;

  const { data, error } = await supabase.rpc('get_profile_event_directory', {
    p_profile_user_id: profileUserId,
  });

  if (error) throw error;

  return {
    mode: data?.mode || 'self',
    upcoming: (data?.upcoming || []).map(normalizeEvent),
    attended: (data?.attended || []).map(normalizeEvent),
  };
}

export async function fetchProfileConnectionDirectory(userId) {
  const session = await ensureAuthed();
  const profileUserId = userId || session.user.id;

  const { data, error } = await supabase.rpc(
    'get_profile_connection_directory',
    { p_profile_user_id: profileUserId }
  );

  if (error) throw error;

  return {
    mode: data?.mode || 'connections',
    count: Number(data?.count || 0),
    people: (data?.people || []).map(normalizePerson),
  };
}
