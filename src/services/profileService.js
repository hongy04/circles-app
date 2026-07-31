import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { trackLaunchEvent } from './analyticsService';
import {
  FEATURE_FLAGS,
  loadFeatureFlags,
  requireFeature,
} from './featureFlagService';
import { uploadToBucket } from './uploadService';
import { fetchProfileSocialStats } from './profileDirectoryService';
import { unregisterCurrentPushDevice } from './pushNotificationService';

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

export async function fetchPreConnectionProfileShell(userId) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.PRECONNECTION_PROFILE_SHELL,
    'Pre-connection profiles are temporarily unavailable.'
  );

  const { data, error } = await supabase
    .rpc('get_preconnection_profile_shell', {
      profile_user_id: userId,
    })
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error('This profile is private or unavailable.');
  }

  const featureFlags = await loadFeatureFlags();
  const previewEnabled =
    featureFlags[FEATURE_FLAGS.MUTUAL_PREVIEW_POSTS] !== false;
  const shell = {
    ...data,
    ...(previewEnabled
      ? {}
      : {
          preview_post_id: null,
          preview_caption: null,
          preview_url: null,
          preview_media_type: null,
          preview_created_at: null,
          preview_media_count: 0,
        }),
    mutual_connection_count: Number(data.mutual_connection_count || 0),
    shared_circle_count: Number(data.shared_circle_count || 0),
    shared_event_count: Number(data.shared_event_count || 0),
    latest_shared_event_title: data.latest_shared_event_title || null,
    latest_shared_event_at: data.latest_shared_event_at || null,
    preview_media_count: previewEnabled
      ? Number(data.preview_media_count || 0)
      : 0,
  };

  void trackLaunchEvent('preconnection_profile_opened', {
    surface: 'preconnection_profile',
    has_preview: Boolean(shell.preview_post_id),
    has_mutual_contact: Boolean(shell.has_contact_context),
    mutual_connection_count: shell.mutual_connection_count,
    shared_circle_count: shell.shared_circle_count,
    request_state: shell.request_state || 'none',
  });

  return shell;
}

export async function fetchProfilePage(userId) {
  const profile = await fetchProfileOverview(userId);

  if (profile.can_view_posts) {
    const [posts, socialStats] = await Promise.all([
      fetchProfilePosts(profile.id),
      fetchProfileSocialStats(profile.id),
    ]);

    return {
      profile,
      posts,
      socialStats,
    };
  }

  const shell = await fetchPreConnectionProfileShell(profile.id);

  return {
    profile: {
      ...profile,
      ...shell,
      can_view_posts: false,
      post_count: 0,
      connection_count: 0,
    },
    posts: [],
    socialStats: null,
  };
}


export async function removeProfileConnection(otherUserId) {
  await ensureAuthed();

  const { data, error } = await supabase.rpc(
    'remove_profile_connection',
    { p_other_user_id: otherUserId }
  );

  if (error) throw error;
  return data || { removed: true, shared_circle_locked: false };
}

export async function fetchMyMutualPreviewPostId() {
  await ensureAuthed();

  const { data, error } = await supabase.rpc(
    'get_my_mutual_preview_post_id'
  );

  if (error) throw error;
  return data || null;
}

export async function setMyMutualPreviewPost(postId = null) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.MUTUAL_PREVIEW_POSTS,
    'Mutuals preview posts are temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc(
    'set_my_mutual_preview_post',
    {
      p_post_id: postId || null,
    }
  );

  if (error) throw error;

  void trackLaunchEvent('mutual_preview_updated', {
    surface: 'profile',
    action: postId ? 'set' : 'clear',
  });

  return data || null;
}


export function isProfileIdentityComplete(profile = {}) {
  return Boolean(
    profile.display_name?.trim()
    && profile.username?.trim()
    && profile.avatar_url
  );
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

export async function sendProfileConnectionRequest(userId, sourceEventId = null) {
  const rpcName = sourceEventId
    ? 'send_shared_event_connection_request'
    : 'send_connection_request';
  const params = sourceEventId
    ? { p_event_id: sourceEventId, p_to_user_id: userId }
    : { to_user_id: userId, note: null };

  const { error } = await supabase.rpc(rpcName, params);

  if (error) throw error;

  if (!sourceEventId) {
    void trackLaunchEvent('connection_request_sent', {
      surface: 'preconnection_profile',
    });
  }
}

export async function respondToProfileRequest(requestId, action) {
  const { error } = await supabase.rpc('respond_connection_request', {
    req_id: requestId,
    action,
  });

  if (error) throw error;

  void trackLaunchEvent('connection_request_responded', {
    surface: 'preconnection_profile',
    action,
  });
}

export async function getAccountSession() {
  const session = await ensureAuthed();
  return session;
}

export async function signOut() {
  await unregisterCurrentPushDevice({ bestEffort: true });
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
