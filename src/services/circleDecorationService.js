import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { uploadPathToBucket } from './uploadService';

const BUCKET = 'circle-decor';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;
const REMOTE_URI_PATTERN = /^https?:\/\//i;

function normalizeStickerMime(mime) {
  const clean = String(mime || '').toLowerCase();
  if (clean === 'image/png' || clean === 'image/webp') return clean;
  return 'image/jpeg';
}

async function signDecorationPath(path) {
  const cleanPath = String(path || '').trim();
  if (!cleanPath) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(cleanPath, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;
  return data?.signedUrl || null;
}

async function signCustomStickerAssets(assets = []) {
  const cleanAssets = Array.isArray(assets) ? assets : [];
  return Promise.all(cleanAssets.map(async (asset) => ({
    id: String(asset?.id || ''),
    path: asset?.path || null,
    mimeType: asset?.mime_type || asset?.mimeType || 'image/png',
    url: asset?.path ? await signDecorationPath(asset.path) : null,
  })));
}

export async function fetchCircleDecoration(conversationId) {
  await ensureAuthed();

  const { data, error } = await supabase
    .rpc('get_circle_decoration_v3', { p_conversation_id: conversationId })
    .maybeSingle();

  if (error) throw error;

  const [headerUrl, backgroundUrl, customStickers] = await Promise.all([
    signDecorationPath(data?.circle_header_path),
    signDecorationPath(data?.circle_background_path),
    signCustomStickerAssets(data?.circle_custom_stickers),
  ]);

  return {
    circle_header_path: data?.circle_header_path || null,
    circle_header_url: headerUrl,
    circle_background_path: data?.circle_background_path || null,
    circle_background_url: backgroundUrl,
    circle_background_color: data?.circle_background_color || null,
    circle_stickers: Array.isArray(data?.circle_stickers) ? data.circle_stickers : [],
    circle_custom_stickers: customStickers,
    canCustomize: Boolean(data?.can_customize),
    isTwoPerson: Boolean(data?.is_two_person),
  };
}


export async function saveCircleStickerState({
  conversationId,
  stickers = [],
  customStickers = [],
  existingCustomStickers = [],
  onPhaseChange,
}) {
  await ensureAuthed();
  const uploadedPaths = [];

  try {
    const persistedAssets = [];
    for (const asset of Array.isArray(customStickers) ? customStickers : []) {
      if (asset?.path) {
        persistedAssets.push({
          id: String(asset.id),
          path: String(asset.path),
          mime_type: normalizeStickerMime(asset.mimeType || asset.mime_type),
        });
        continue;
      }

      const localUri = asset?.localUri || asset?.url;
      if (!localUri || REMOTE_URI_PATTERN.test(localUri)) {
        throw new Error('A custom sticker upload is missing its local image.');
      }

      onPhaseChange?.('Uploading custom stickers…');
      const path = await uploadPathToBucket(
        localUri,
        BUCKET,
        normalizeStickerMime(asset?.mimeType || asset?.mime_type),
        { folder: `${conversationId}/stickers`, preserveFormat: true }
      );
      uploadedPaths.push(path);
      persistedAssets.push({
        id: String(asset.id),
        path,
        mime_type: normalizeStickerMime(asset?.mimeType || asset?.mime_type),
      });
    }

    onPhaseChange?.('Saving shared sticker canvas…');
    const { error } = await supabase.rpc('update_circle_sticker_state', {
      p_conversation_id: conversationId,
      p_circle_stickers: Array.isArray(stickers) ? stickers : [],
      p_custom_stickers: persistedAssets,
    });
    if (error) throw error;

    const nextPaths = new Set(persistedAssets.map((asset) => asset.path));
    const stalePaths = (Array.isArray(existingCustomStickers) ? existingCustomStickers : [])
      .map((asset) => asset?.path)
      .filter((path) => path && !nextPaths.has(path));

    if (stalePaths.length) {
      try {
        await removeDecorationPaths(stalePaths);
      } catch (cleanupError) {
        console.warn('Could not remove old custom Circle stickers:', cleanupError?.message || cleanupError);
      }
    }

    return fetchCircleDecoration(conversationId);
  } catch (error) {
    if (uploadedPaths.length) {
      try {
        await removeDecorationPaths(uploadedPaths);
      } catch {
        // Best effort. Shared Circle decoration files remain private.
      }
    }
    throw error;
  }
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
