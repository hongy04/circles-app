import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { uploadToBucket } from './uploadService';
import { validateStoryAsset } from '../utils/mediaValidation';

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

function emitProgress(onProgress, progress, label) {
  onProgress?.({ progress, label });
}

function deriveExpiration(row) {
  if (row.expire_at) return row.expire_at;

  const createdAt = new Date(row.created_at).getTime();
  if (!Number.isFinite(createdAt)) return null;

  return new Date(createdAt + STORY_LIFETIME_MS).toISOString();
}

function storagePathFromPublicUrl(url, bucket) {
  if (!url || !bucket) return null;

  const marker = `/storage/v1/object/public/${bucket}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;

  const encodedPath = url
    .slice(markerIndex + marker.length)
    .split('?')[0];

  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

export async function fetchActiveStories() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session) return [];

  const { data, error } = await supabase.rpc('get_active_stories');
  if (error) throw error;

  const storiesByUser = new Map();
  const currentUserId = session.user.id;

  (data || []).forEach((row) => {
    if (!storiesByUser.has(row.user_id)) {
      storiesByUser.set(row.user_id, {
        userId: row.user_id,
        userName: row.display_name || 'Someone',
        avatar: row.avatar_url || null,
        isMine: row.user_id === currentUserId,
        items: [],
      });
    }

    storiesByUser.get(row.user_id).items.push({
      id: row.id,
      user_id: row.user_id,
      url: row.url,
      media_type: row.media_type,
      created_at: row.created_at,
      expires_at: deriveExpiration(row),
    });
  });

  const groups = Array.from(storiesByUser.values());

  groups.forEach((group) => {
    group.items.sort(
      (left, right) =>
        new Date(left.created_at).getTime() -
        new Date(right.created_at).getTime()
    );
  });

  groups.sort((left, right) => {
    if (left.isMine) return -1;
    if (right.isMine) return 1;

    const leftNewest = left.items.at(-1)?.created_at || '';
    const rightNewest = right.items.at(-1)?.created_at || '';
    return new Date(rightNewest).getTime() - new Date(leftNewest).getTime();
  });

  return groups;
}

export async function createStoryFromAsset(asset, options = {}) {
  const validationError = validateStoryAsset(asset);
  if (validationError) throw new Error(validationError);

  emitProgress(options.onProgress, 0.08, 'Preparing media…');

  const { user } = await ensureAuthed();
  const mediaType = asset.type === 'video' ? 'video' : 'image';
  const mimeType =
    asset.mimeType ||
    (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');

  emitProgress(options.onProgress, 0.2, 'Uploading story…');

  const url = await uploadToBucket(
    asset.uri,
    'stories',
    mimeType,
    { folder: user.id }
  );

  emitProgress(options.onProgress, 0.82, 'Publishing story…');

  const { data, error } = await supabase
    .from('stories')
    .insert({
      user_id: user.id,
      url,
      media_type: mediaType,
    })
    .select('id, user_id, url, media_type, created_at, expire_at')
    .single();

  if (error) {
    const uploadedPath = storagePathFromPublicUrl(url, 'stories');
    if (uploadedPath) {
      await supabase.storage.from('stories').remove([uploadedPath]);
    }
    throw error;
  }

  emitProgress(options.onProgress, 1, 'Story posted');
  return data;
}

export async function deleteOwnStory(story) {
  if (!story?.id) throw new Error('This story could not be identified.');

  const { user } = await ensureAuthed();

  const { data, error } = await supabase
    .from('stories')
    .delete()
    .eq('id', story.id)
    .eq('user_id', user.id)
    .select('id');

  if (error) throw error;
  if (!data?.length) {
    throw new Error('The story was not deleted. Refresh and try again.');
  }

  const storagePath = storagePathFromPublicUrl(story.url, 'stories');

  if (storagePath) {
    const { error: cleanupError } = await supabase.storage
      .from('stories')
      .remove([storagePath]);

    if (cleanupError) {
      console.warn('Story record deleted, but media cleanup failed.', cleanupError);
    }
  }

  return story.id;
}
