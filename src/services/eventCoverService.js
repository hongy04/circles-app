import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import {
  getCachedSignedUrls,
  removeStorageSignedUrlCacheEntries,
} from './storageSignedUrlCacheService';

export const EVENT_COVER_BUCKET = 'event-media';
export const EVENT_COVER_SIGNED_URL_TTL_SECONDS = 10 * 60;
export const EVENT_COVER_SOURCE_LIMIT_BYTES = 48 * 1024 * 1024;

async function signCoverPath(storagePath) {
  if (!storagePath) return null;
  const signed = await getCachedSignedUrls(
    EVENT_COVER_BUCKET,
    [storagePath],
    EVENT_COVER_SIGNED_URL_TTL_SECONDS
  );
  return signed.get(storagePath) || null;
}

export async function uploadEventCoverPhoto({ eventId, asset }) {
  await ensureAuthed();
  if (!eventId) throw new Error('Event is missing.');
  if (!asset?.uri) throw new Error('Choose a photo for the event.');
  if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) {
    throw new Error('Event covers currently support photos only.');
  }
  if (asset.fileSize && asset.fileSize > EVENT_COVER_SOURCE_LIMIT_BYTES) {
    throw new Error('Choose a photo smaller than 48 MB.');
  }

  const { data: slot, error: prepareError } = await supabase.rpc(
    'prepare_event_cover_upload',
    { p_event_id: eventId }
  );
  if (prepareError) throw prepareError;
  if (!slot?.storage_path) throw new Error('Circles could not prepare the event photo.');

  const resizeActions = Number(asset.width || 0) > 1600
    ? [{ resize: { width: 1600 } }]
    : [];
  const prepared = await ImageManipulator.manipulateAsync(
    asset.uri,
    resizeActions,
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
  );
  const base64 = await FileSystem.readAsStringAsync(prepared.uri, { encoding: 'base64' });
  let uploaded = false;

  try {
    const { error: uploadError } = await supabase.storage
      .from(EVENT_COVER_BUCKET)
      .upload(slot.storage_path, decode(base64), {
        contentType: 'image/jpeg',
        upsert: false,
      });
    if (uploadError) throw uploadError;
    uploaded = true;

    const { data: finalized, error: finalizeError } = await supabase.rpc(
      'finalize_event_cover_upload',
      {
        p_event_id: eventId,
        p_storage_path: slot.storage_path,
        p_width: Number(asset.width || 0) > 1600 ? 1600 : (asset.width || null),
        p_height: Number(asset.width || 0) > 1600 && asset.height
          ? Math.max(1, Math.round(Number(asset.height) * (1600 / Number(asset.width))))
          : (asset.height || null),
      }
    );
    if (finalizeError) throw finalizeError;

    const previousPath = finalized?.previous_storage_path || slot?.previous_storage_path || null;
    if (previousPath && previousPath !== slot.storage_path) {
      try {
        await supabase.storage.from(EVENT_COVER_BUCKET).remove([previousPath]);
        removeStorageSignedUrlCacheEntries(EVENT_COVER_BUCKET, [previousPath]);
      } catch {
        // The new cover is already authoritative. A rare old object can be
        // cleaned up later without exposing it from the event row.
      }
    }

    let url = null;
    try {
      url = await signCoverPath(slot.storage_path);
    } catch {
      // The event is already saved. A normal detail refresh can mint the URL.
    }

    return {
      storagePath: slot.storage_path,
      url,
      width: Number(asset.width || 0) > 1600 ? 1600 : (Number(asset.width || 0) || null),
      height: Number(asset.width || 0) > 1600 && asset.height
        ? Math.max(1, Math.round(Number(asset.height) * (1600 / Number(asset.width))))
        : (Number(asset.height || 0) || null),
    };
  } catch (error) {
    if (uploaded) {
      try {
        await supabase.storage.from(EVENT_COVER_BUCKET).remove([slot.storage_path]);
      } catch {
        // Preserve the original error.
      }
    }
    try {
      await supabase.rpc('cancel_event_cover_upload', {
        p_event_id: eventId,
        p_storage_path: slot.storage_path,
      });
    } catch {
      // The stale pending path is harmless and will be replaced by the next
      // prepared upload if cleanup itself is unavailable.
    }
    throw error;
  }
}

export async function removeEventCoverPhoto(eventId) {
  await ensureAuthed();
  if (!eventId) throw new Error('Event is missing.');

  const { data, error } = await supabase.rpc('remove_event_cover_photo', {
    p_event_id: eventId,
  });
  if (error) throw error;

  const previousPath = data?.previous_storage_path || null;
  if (previousPath) {
    try {
      await supabase.storage.from(EVENT_COVER_BUCKET).remove([previousPath]);
      removeStorageSignedUrlCacheEntries(EVENT_COVER_BUCKET, [previousPath]);
    } catch {
      // The database already stopped exposing this cover. Storage cleanup can
      // be retried later without changing what viewers see.
    }
  }

  return true;
}

export async function getSignedEventCoverUrl(storagePath) {
  await ensureAuthed();
  return signCoverPath(storagePath);
}
