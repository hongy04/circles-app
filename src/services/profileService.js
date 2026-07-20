import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { uploadToBucket } from './uploadService';

const REMOTE_URI_PATTERN = /^https?:\/\//i;

export function normalizeUsername(value = '') {
  return value
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

export function validateProfileInput({ displayName, username, bio }) {
  const cleanName = displayName.trim();
  const cleanUsername = normalizeUsername(username);
  const cleanBio = bio.trim();

  if (!cleanName) {
    throw new Error('Enter a display name.');
  }

  if (cleanName.length > 40) {
    throw new Error('Display name must be 40 characters or fewer.');
  }

  if (cleanUsername) {
    if (cleanUsername.length < 3 || cleanUsername.length > 24) {
      throw new Error('Username must be between 3 and 24 characters.');
    }

    if (!/^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$/.test(cleanUsername)) {
      throw new Error(
        'Username can use lowercase letters, numbers, periods, and underscores. It must start and end with a letter or number.'
      );
    }
  }

  if (cleanBio.length > 160) {
    throw new Error('Bio must be 160 characters or fewer.');
  }

  return {
    displayName: cleanName,
    username: cleanUsername,
    bio: cleanBio,
  };
}

export async function fetchProfileOverview(userId) {
  const session = await ensureAuthed();
  const targetUserId = userId || session.user.id;

  const { data, error } = await supabase
    .rpc('get_profile_overview', {
      profile_user_id: targetUserId,
    })
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error('This profile is private or unavailable.');
  }

  return data;
}

export async function fetchProfilePosts(userId) {
  const { data, error } = await supabase.rpc('get_profile_posts', {
    profile_user_id: userId,
  });

  if (error) throw error;

  return (data || []).map((post) => ({
    ...post,
    previewUrl: post.preview_url || post.image_url || null,
    mediaType: post.media_type || 'image',
    mediaCount: Number(post.media_count || 0),
  }));
}

export async function fetchProfilePage(userId) {
  const profile = await fetchProfileOverview(userId);
  const posts = profile.can_view_posts
    ? await fetchProfilePosts(profile.id)
    : [];

  return { profile, posts };
}

export async function fetchMyEditableProfile() {
  const session = await ensureAuthed();

  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, username, avatar_url, bio')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw error;

  return {
    id: session.user.id,
    display_name: data?.display_name || '',
    username: data?.username || '',
    avatar_url: data?.avatar_url || null,
    bio: data?.bio || '',
  };
}

export async function saveMyProfile({
  displayName,
  username,
  bio,
  avatarUri,
  avatarMimeType = 'image/jpeg',
  onPhaseChange,
}) {
  const clean = validateProfileInput({ displayName, username, bio });
  const session = await ensureAuthed();
  let avatarUrl = avatarUri || null;

  if (avatarUri && !REMOTE_URI_PATTERN.test(avatarUri)) {
    onPhaseChange?.('Uploading photo…');
    avatarUrl = await uploadToBucket(
      avatarUri,
      'avatars',
      avatarMimeType,
      { folder: session.user.id }
    );
  }

  onPhaseChange?.('Saving profile…');

  const { data, error } = await supabase
    .rpc('update_my_profile', {
      p_display_name: clean.displayName,
      p_username: clean.username || null,
      p_bio: clean.bio || null,
      p_avatar_url: avatarUrl,
    })
    .single();

  if (error) {
    if (error.code === '23505' || /username.*taken/i.test(error.message || '')) {
      throw new Error('That username is already taken.');
    }

    throw error;
  }

  return data;
}

export async function sendProfileConnectionRequest(userId) {
  const { error } = await supabase.rpc('send_connection_request', {
    to_user_id: userId,
    note: null,
  });

  if (error) throw error;
}

export async function respondToProfileRequest(requestId, action) {
  const { error } = await supabase.rpc('respond_connection_request', {
    req_id: requestId,
    action,
  });

  if (error) throw error;
}

export async function getAccountSession() {
  const session = await ensureAuthed();
  return session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
