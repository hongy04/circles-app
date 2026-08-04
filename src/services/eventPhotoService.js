import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';
import { compressIfImage } from './uploadService';
import {
  getCachedSignedUrls,
  removeStorageSignedUrlCacheEntries,
} from './storageSignedUrlCacheService';

export const EVENT_PHOTO_BUCKET = 'event-media';
export const EVENT_PHOTO_SELECTION_LIMIT = 10;
export const EVENT_PHOTO_SOURCE_LIMIT_BYTES = 48 * 1024 * 1024;
export const EVENT_PHOTO_SIGNED_URL_TTL_SECONDS = 10 * 60;

async function createSignedUrlMap(storagePaths = []) {
  return getCachedSignedUrls(
    EVENT_PHOTO_BUCKET,
    storagePaths,
    EVENT_PHOTO_SIGNED_URL_TTL_SECONDS
  );
}

function mapPhoto(photo = {}, signedByPath = new Map()) {
  const storagePath = photo.storage_path || '';
  return {
    id: photo.photo_id || storagePath,
    storagePath,
    url: signedByPath.get(storagePath) || photo.signed_url || null,
    width: Number(photo.width || 0) || null,
    height: Number(photo.height || 0) || null,
    createdAt: photo.created_at || null,
    uploaderName: photo.uploader_name || 'Circle member',
    uploaderAvatar: photo.uploader_avatar || null,
    canDelete: Boolean(photo.can_delete),
  };
}

export async function listEventPhotos(eventId) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_PHOTO_GALLERY,
    'Event photos are temporarily unavailable.'
  );

  if (!eventId) throw new Error('Event is missing.');

  const { data, error } = await supabase.rpc('list_event_photos', {
    p_event_id: eventId,
  });

  if (error) throw error;

  const rawPhotos = Array.isArray(data?.photos) ? data.photos : [];
  const signedByPath = await createSignedUrlMap(
    rawPhotos.map((photo) => photo?.storage_path)
  );

  return {
    canUpload: Boolean(data?.can_upload),
    photoCount: Number(data?.photo_count || 0),
    photos: rawPhotos
      .map((photo) => mapPhoto(photo, signedByPath))
      .filter((photo) => Boolean(photo.url)),
  };
}

async function prepareUpload(eventId) {
  const { data, error } = await supabase.rpc('prepare_event_photo_upload', {
    p_event_id: eventId,
  });

  if (error) throw error;
  if (!data?.photo_id || !data?.storage_path) {
    throw new Error('Circles could not prepare this photo upload.');
  }

  return {
    photoId: data.photo_id,
    storagePath: data.storage_path,
  };
}

async function cancelUpload(photoId) {
  if (!photoId) return;
  await supabase.rpc('cancel_event_photo_upload', {
    p_photo_id: photoId,
  });
}

async function uploadOneEventPhoto({ eventId, asset }) {
  if (!asset?.uri) throw new Error('A selected photo is unavailable.');
  if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) {
    throw new Error('Event galleries currently support photos only.');
  }
  if (
    asset.fileSize
    && asset.fileSize > EVENT_PHOTO_SOURCE_LIMIT_BYTES
  ) {
    throw new Error('Each selected photo must be 48 MB or smaller.');
  }

  const slot = await prepareUpload(eventId);
  let objectUploaded = false;
  let uploadFinalized = false;

  try {
    const prepared = await compressIfImage(
      asset.uri,
      asset.mimeType || 'image/jpeg'
    );

    const base64 = await FileSystem.readAsStringAsync(prepared.uri, {
      encoding: 'base64',
    });

    const { error: uploadError } = await supabase.storage
      .from(EVENT_PHOTO_BUCKET)
      .upload(slot.storagePath, decode(base64), {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;
    objectUploaded = true;

    const { data, error: finalizeError } = await supabase.rpc(
      'finalize_event_photo_upload',
      {
        p_photo_id: slot.photoId,
        p_width: asset.width || null,
        p_height: asset.height || null,
      }
    );

    if (finalizeError) throw finalizeError;
    uploadFinalized = true;

    let signedByPath = new Map();
    try {
      signedByPath = await createSignedUrlMap([slot.storagePath]);
    } catch {
      // The upload is already safely finalized. A gallery refresh can mint a
      // fresh signed URL if this one short-lived signing request fails.
    }

    return mapPhoto({
      photo_id: data?.photo_id || slot.photoId,
      storage_path: data?.storage_path || slot.storagePath,
      width: asset.width || null,
      height: asset.height || null,
      uploader_name: 'You',
      can_delete: true,
      created_at: new Date().toISOString(),
    }, signedByPath);
  } catch (error) {
    if (!uploadFinalized && objectUploaded) {
      try {
        await supabase.storage
          .from(EVENT_PHOTO_BUCKET)
          .remove([slot.storagePath]);
      } catch {
        // The pending row is still cancelled below. A rare orphaned object can
        // be cleaned up administratively without exposing it in the gallery.
      }
    }

    if (!uploadFinalized) {
      try {
        await cancelUpload(slot.photoId);
      } catch {
        // Preserve the original upload error.
      }
    }

    throw error;
  }
}

export async function uploadEventPhotos({ eventId, assets, onProgress }) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_PHOTO_GALLERY,
    'Event photos are temporarily unavailable.'
  );

  const selected = Array.isArray(assets) ? assets : [];
  if (!eventId) throw new Error('Event is missing.');
  if (selected.length < 1) throw new Error('Choose at least one photo.');
  if (selected.length > EVENT_PHOTO_SELECTION_LIMIT) {
    throw new Error(`Choose up to ${EVENT_PHOTO_SELECTION_LIMIT} photos at a time.`);
  }

  const uploaded = [];
  for (let index = 0; index < selected.length; index += 1) {
    onProgress?.({ current: index + 1, total: selected.length });
    const photo = await uploadOneEventPhoto({
      eventId,
      asset: selected[index],
    });
    uploaded.push(photo);
  }

  return uploaded;
}

export async function deleteEventPhoto(photo) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_PHOTO_GALLERY,
    'Event photos are temporarily unavailable.'
  );

  if (!photo?.id || !photo?.storagePath) {
    throw new Error('Photo is missing.');
  }

  const { error: storageError } = await supabase.storage
    .from(EVENT_PHOTO_BUCKET)
    .remove([photo.storagePath]);

  if (storageError) throw storageError;
  removeStorageSignedUrlCacheEntries(EVENT_PHOTO_BUCKET, [photo.storagePath]);

  const { data, error } = await supabase.rpc('delete_event_photo', {
    p_photo_id: photo.id,
  });

  if (error) {
    throw new Error(
      `${error.message || 'The photo record could not be removed.'} The image file was already deleted; refresh the gallery.`
    );
  }

  return Boolean(data);
}
