import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { uploadPathToBucket } from './uploadService';

const BUCKET = 'circle-decor';
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

export async function fetchCircleDecoration(conversationId) {
  await ensureAuthed();

  const { data, error } = await supabase
    .rpc('get_circle_decoration', { p_conversation_id: conversationId })
    .maybeSingle();

  if (error) throw error;

  const [headerUrl, backgroundUrl] = await Promise.all([
    signDecorationPath(data?.circle_header_path),
    signDecorationPath(data?.circle_background_path),
  ]);

  return {
    circle_header_path: data?.circle_header_path || null,
    circle_header_url: headerUrl,
    circle_background_path: data?.circle_background_path || null,
    circle_background_url: backgroundUrl,
    circle_background_color: data?.circle_background_color || null,
    canCustomize: Boolean(data?.can_customize),
    isTwoPerson: Boolean(data?.is_two_person),
  };
}

async function removeDecorationPaths(paths = []) {
  const cleanPaths = Array.from(
    new Set(paths.map((path) => String(path || '').trim()).filter(Boolean))
  );
  if (!cleanPaths.length) return;

  const { error } = await supabase.storage.from(BUCKET).remove(cleanPaths);
  if (error) throw error;
}

export async function saveCircleDecoration({
  conversationId,
  headerUri,
  headerMimeType = 'image/jpeg',
  existingHeaderPath = null,
  backgroundUri,
  backgroundMimeType = 'image/jpeg',
  existingBackgroundPath = null,
  backgroundColor = null,
  onPhaseChange,
}) {
  await ensureAuthed();

  let nextHeaderPath = existingHeaderPath || null;
  let nextBackgroundPath = existingBackgroundPath || null;
  const uploadedPaths = [];

  try {
    if (!headerUri) {
      nextHeaderPath = null;
    } else if (!REMOTE_URI_PATTERN.test(headerUri)) {
      onPhaseChange?.('Uploading shared header…');
      nextHeaderPath = await uploadPathToBucket(
        headerUri,
        BUCKET,
        headerMimeType,
        { folder: `${conversationId}/header` }
      );
      uploadedPaths.push(nextHeaderPath);
    }

    if (!backgroundUri) {
      nextBackgroundPath = null;
    } else if (!REMOTE_URI_PATTERN.test(backgroundUri)) {
      onPhaseChange?.('Uploading shared background…');
      nextBackgroundPath = await uploadPathToBucket(
        backgroundUri,
        BUCKET,
        backgroundMimeType,
        { folder: `${conversationId}/background` }
      );
      uploadedPaths.push(nextBackgroundPath);
    }

    const cleanColor = nextBackgroundPath
      ? null
      : String(backgroundColor || '').trim() || null;

    onPhaseChange?.('Saving shared decorations…');
    const { data, error } = await supabase
      .rpc('update_circle_decoration', {
        p_conversation_id: conversationId,
        p_circle_header_path: nextHeaderPath,
        p_circle_background_path: nextBackgroundPath,
        p_circle_background_color: cleanColor,
      })
      .single();

    if (error) throw error;

    const stalePaths = [
      existingHeaderPath && existingHeaderPath !== data?.circle_header_path
        ? existingHeaderPath
        : null,
      existingBackgroundPath && existingBackgroundPath !== data?.circle_background_path
        ? existingBackgroundPath
        : null,
    ].filter(Boolean);

    if (stalePaths.length) {
      try {
        await removeDecorationPaths(stalePaths);
      } catch (cleanupError) {
        console.warn('Could not remove replaced Circle decoration:', cleanupError?.message || cleanupError);
      }
    }

    return fetchCircleDecoration(conversationId);
  } catch (error) {
    if (uploadedPaths.length) {
      try {
        await removeDecorationPaths(uploadedPaths);
      } catch {
        // Best effort. A later replacement can clean stale objects manually.
      }
    }
    throw error;
  }
}
