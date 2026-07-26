import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';
import { compressIfImage } from './uploadService';

export const EVENT_PHOTO_BUCKET = 'event-media';
export const EVENT_PHOTO_SELECTION_LIMIT = 10;
export const EVENT_PHOTO_SOURCE_LIMIT_BYTES = 48 * 1024 * 1024;

export function publicEventPhotoUrl(storagePath) {
  if (!storagePath) return null;
  const { data } = supabase.storage
    .from(EVENT_PHOTO_BUCKET)
    .getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

function mapPhoto(photo = {}) {
  const storagePath = photo.storage_path || '';
  return {
    id: photo.photo_id || storagePath,
    storagePath,
    url: publicEventPhotoUrl(storagePath),
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

  return {
    canUpload: Boolean(data?.can_upload),
    photoCount: Number(data?.photo_count || 0),
    photos: (data?.photos || []).map(mapPhoto),
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

    return mapPhoto({
      photo_id: data?.photo_id || slot.photoId,
      storage_path: data?.storage_path || slot.storagePath,
      width: asset.width || null,
      height: asset.height || null,
      uploader_name: 'You',
      can_delete: true,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    if (objectUploaded) {
      try {
        await supabase.storage
          .from(EVENT_PHOTO_BUCKET)
          .remove([slot.storagePath]);
      } catch {
        // The pending row is still cancelled below. A rare orphaned object can
        // be cleaned up administratively without exposing it in the gallery.
      }
    }

    try {
      await cancelUpload(slot.photoId);
    } catch {
      // Preserve the original upload error.
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
