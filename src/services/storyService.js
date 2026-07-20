import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { uploadToBucket } from './uploadService';
import { validateStoryAsset } from '../utils/mediaValidation';

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

  (data || []).forEach((row) => {
    if (!storiesByUser.has(row.user_id)) {
      storiesByUser.set(row.user_id, {
        userId: row.user_id,
        userName: row.display_name || 'Someone',
        avatar: row.avatar_url || null,
        items: [],
      });
    }

    storiesByUser.get(row.user_id).items.push({
      id: row.id,
      url: row.url,
      media_type: row.media_type,
      created_at: row.created_at,
    });
  });

  const groups = Array.from(storiesByUser.values());
  const currentUserId = session.user.id;

  groups.sort((left, right) => {
    if (left.userId === currentUserId) return -1;
    if (right.userId === currentUserId) return 1;
    return 0;
  });

  return groups;
}

export async function createStoryFromAsset(asset) {
  const validationError = validateStoryAsset(asset);
  if (validationError) throw new Error(validationError);

  const { user } = await ensureAuthed();
  const mediaType = asset.type === 'video' ? 'video' : 'image';
  const mimeType =
    asset.mimeType ||
    (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');

  const url = await uploadToBucket(
    asset.uri,
    'stories',
    mimeType
  );

  const { data, error } = await supabase
    .from('stories')
    .insert({
      user_id: user.id,
      url,
      media_type: mediaType,
    })
    .select('id, user_id, url, media_type, created_at')
    .single();

  if (error) throw error;
  return data;
}
