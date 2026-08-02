import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { uploadPathToBucket } from './uploadService';

const BUCKET = 'profile-decor';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;
const REMOTE_URI_PATTERN = /^https?:\/\//i;

async function signDecorationPath(path) {
  const cleanPath = String(path || '').trim();
  if (!cleanPath) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(cleanPath, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;
  return data?.signedUrl || null;
}

export async function fetchProfileDecoration(userId) {
  await ensureAuthed();

  const { data, error } = await supabase
    .rpc('get_profile_decoration', { profile_user_id: userId })
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      profile_header_path: null,
      profile_header_url: null,
      profile_background_path: null,
      profile_background_url: null,
      profile_background_color: null,
    };
  }

  const [headerUrl, backgroundUrl] = await Promise.all([
    signDecorationPath(data.profile_header_path),
    signDecorationPath(data.profile_background_path),
  ]);

  return {
    profile_header_path: data.profile_header_path || null,
    profile_header_url: headerUrl,
    profile_background_path: data.profile_background_path || null,
    profile_background_url: backgroundUrl,
    profile_background_color: data.profile_background_color || null,
  };
}

export async function fetchMyProfileDecoration() {
  const session = await ensureAuthed();

  const [{ data: profile, error: profileError }, decoration] = await Promise.all([
    supabase
      .from('users')
      .select('id, display_name, username, avatar_url')
      .eq('id', session.user.id)
      .maybeSingle(),
    fetchProfileDecoration(session.user.id),
  ]);

  if (profileError) throw profileError;

  return {
    id: session.user.id,
    display_name: profile?.display_name || '',
    username: profile?.username || '',
    avatar_url: profile?.avatar_url || null,
    ...decoration,
  };
}

async function removeDecorationPaths(paths = []) {
  const cleanPaths = Array.from(new Set(paths.map((path) => String(path || '').trim()).filter(Boolean)));
  if (!cleanPaths.length) return;

  const { error } = await supabase.storage.from(BUCKET).remove(cleanPaths);
  if (error) throw error;
}

export async function saveMyProfileDecoration({
  headerUri,
  headerMimeType = 'image/jpeg',
  existingHeaderPath = null,
  backgroundUri,
  backgroundMimeType = 'image/jpeg',
  existingBackgroundPath = null,
  backgroundColor = null,
  onPhaseChange,
}) {
  const session = await ensureAuthed();
  const userId = session.user.id;
  let nextHeaderPath = existingHeaderPath || null;
  let nextBackgroundPath = existingBackgroundPath || null;
  const uploadedPaths = [];

  try {
    if (!headerUri) {
      nextHeaderPath = null;
    } else if (!REMOTE_URI_PATTERN.test(headerUri)) {
      onPhaseChange?.('Uploading header…');
      nextHeaderPath = await uploadPathToBucket(
        headerUri,
        BUCKET,
        headerMimeType,
        { folder: `${userId}/header` }
      );
      uploadedPaths.push(nextHeaderPath);
    }

    if (!backgroundUri) {
      nextBackgroundPath = null;
    } else if (!REMOTE_URI_PATTERN.test(backgroundUri)) {
      onPhaseChange?.('Uploading background…');
      nextBackgroundPath = await uploadPathToBucket(
        backgroundUri,
        BUCKET,
        backgroundMimeType,
        { folder: `${userId}/background` }
      );
      uploadedPaths.push(nextBackgroundPath);
    }

    const cleanColor = nextBackgroundPath
      ? null
      : String(backgroundColor || '').trim() || null;

    onPhaseChange?.('Saving decorations…');
    const { data, error } = await supabase
      .rpc('update_my_profile_decoration', {
        p_profile_header_path: nextHeaderPath,
        p_profile_background_path: nextBackgroundPath,
        p_profile_background_color: cleanColor,
      })
      .single();

    if (error) throw error;

    const stalePaths = [
      existingHeaderPath && existingHeaderPath !== data?.profile_header_path
        ? existingHeaderPath
        : null,
      existingBackgroundPath && existingBackgroundPath !== data?.profile_background_path
        ? existingBackgroundPath
        : null,
    ].filter(Boolean);

    if (stalePaths.length) {
      try {
        await removeDecorationPaths(stalePaths);
      } catch (cleanupError) {
        console.warn('Could not remove replaced profile decoration:', cleanupError?.message || cleanupError);
      }
    }

    return fetchProfileDecoration(userId);
  } catch (error) {
    if (uploadedPaths.length) {
      try {
        await removeDecorationPaths(uploadedPaths);
      } catch {
        // Best effort: account deletion also sweeps the private decoration prefix.
      }
    }
    throw error;
  }
}
