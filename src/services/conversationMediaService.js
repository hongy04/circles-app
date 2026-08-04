import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import {
  getCachedSignedUrl,
  getCachedSignedUrls,
  removeStorageSignedUrlCacheEntries,
} from './storageSignedUrlCacheService';
import { compressIfImage, normalizeMime } from './uploadService';

export const CONVERSATION_MEDIA_BUCKET = 'conversation-media';

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

function extensionForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime.startsWith('video/')) return 'mp4';
  return 'jpg';
}

export async function uploadConversationAsset({
  conversationId,
  category = 'messages',
  uri,
  mimeType,
}) {
  const { user } = await ensureAuthed();
  const safeConversationId = sanitizeSegment(conversationId);
  const safeCategory = sanitizeSegment(category);

  if (!safeConversationId || !safeCategory || !uri) {
    throw new Error('Conversation media is missing required information.');
  }

  const prepared = await compressIfImage(uri, mimeType || 'image/jpeg');
  const normalizedMime = normalizeMime(prepared.mime);
  const extension = extensionForMime(normalizedMime);
  const filename = `${Date.now()}_${Math.floor(Math.random() * 1e7)}.${extension}`;
  const storagePath = `${safeConversationId}/${safeCategory}/${user.id}/${filename}`;

  const base64 = await FileSystem.readAsStringAsync(prepared.uri, {
    encoding: 'base64',
  });

  const { error } = await supabase.storage
    .from(CONVERSATION_MEDIA_BUCKET)
    .upload(storagePath, decode(base64), {
      contentType: normalizedMime,
      upsert: false,
    });

  if (error) throw error;

  return {
    storagePath,
    mimeType: normalizedMime,
  };
}

export async function createConversationMediaSignedUrl(
  storagePath,
  expiresIn = 3600
) {
  return getCachedSignedUrl(
    CONVERSATION_MEDIA_BUCKET,
    storagePath,
    expiresIn
  );
}

export async function createConversationMediaSignedUrls(
  storagePaths,
  expiresIn = 3600
) {
  return getCachedSignedUrls(
    CONVERSATION_MEDIA_BUCKET,
    storagePaths,
    expiresIn
  );
}

export async function hydrateConversationMediaItems(items = []) {
  const signedUrls = await createConversationMediaSignedUrls(
    items.map((item) => item.storagePath)
  );

  return items.map((item) => ({
    ...item,
    url: signedUrls.get(item.storagePath) || null,
  }));
}

export async function removeConversationMedia(storagePaths = []) {
  const paths = Array.from(new Set(storagePaths.filter(Boolean)));
  if (!paths.length) return [];

  const { data, error } = await supabase.storage
    .from(CONVERSATION_MEDIA_BUCKET)
    .remove(paths);

  if (error) throw error;
  removeStorageSignedUrlCacheEntries(CONVERSATION_MEDIA_BUCKET, paths);
  return data || [];
}
