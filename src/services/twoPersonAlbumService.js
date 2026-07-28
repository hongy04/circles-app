import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';
import { compressIfImage } from './uploadService';

export const TWO_PERSON_ALBUM_BUCKET = 'two-person-album-media';
export const TWO_PERSON_ALBUM_SELECTION_LIMIT = 10;
export const TWO_PERSON_ALBUM_SOURCE_LIMIT_BYTES = 48 * 1024 * 1024;

let albumRealtimeCounter = 0;

async function requireAlbumsFeature() {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.TWO_PERSON_CIRCLE_ALBUMS,
    'Shared albums are temporarily unavailable.'
  );
}

async function signPath(storagePath) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage
    .from(TWO_PERSON_ALBUM_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function mapAlbum(row = {}) {
  return {
    id: row.album_id || row.id,
    conversationId: row.conversation_id,
    title: row.title || 'Shared album',
    note: row.note || '',
    occurredOn: row.occurred_on || null,
    createdBy: row.created_by || null,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    photoCount: Number(row.photo_count || 0),
    coverStoragePath: row.cover_storage_path || null,
    coverUrl: await signPath(row.cover_storage_path || null),
  };
}

async function mapPhoto(row = {}) {
  const storagePath = row.storage_path || '';
  return {
    id: row.photo_id || row.id || storagePath,
    albumId: row.album_id,
    storagePath,
    url: await signPath(storagePath),
    width: Number(row.width || 0) || null,
    height: Number(row.height || 0) || null,
    uploaderName: row.uploader_name || 'Circle member',
    uploaderAvatar: row.uploader_avatar || null,
    createdAt: row.created_at || null,
    canDelete: Boolean(row.can_delete),
  };
}

export async function listTwoPersonAlbums(conversationId) {
  await requireAlbumsFeature();
  if (!conversationId) throw new Error('Our Circle is missing.');

  const { data, error } = await supabase.rpc(
    'list_two_person_circle_albums',
    { p_conversation_id: conversationId }
  );
  if (error) throw error;
  return Promise.all((data || []).map(mapAlbum));
}

export async function getTwoPersonAlbum(albumId) {
  await requireAlbumsFeature();
  if (!albumId) throw new Error('Album is missing.');

  const { data, error } = await supabase.rpc(
    'get_two_person_circle_album',
    { p_album_id: albumId }
  );
  if (error) throw error;
  if (!data) throw new Error('This shared album is unavailable.');

  const album = await mapAlbum(data);
  const photos = await Promise.all((data.photos || []).map(mapPhoto));
  return { ...album, photos };
}

export async function createTwoPersonAlbum({
  conversationId,
  title,
  note = '',
  occurredOn = null,
}) {
  await requireAlbumsFeature();

  const { data, error } = await supabase.rpc(
    'create_two_person_circle_album',
    {
      p_conversation_id: conversationId,
      p_title: String(title || '').trim(),
      p_note: String(note || '').trim(),
      p_occurred_on: occurredOn || null,
    }
  );
  if (error) throw error;
  return data;
}

export async function updateTwoPersonAlbum({
  albumId,
  title,
  note = '',
  occurredOn = null,
}) {
  await requireAlbumsFeature();

  const { data, error } = await supabase.rpc(
    'update_two_person_circle_album',
    {
      p_album_id: albumId,
      p_title: String(title || '').trim(),
      p_note: String(note || '').trim(),
      p_occurred_on: occurredOn || null,
    }
  );
  if (error) throw error;
  return mapAlbum(data);
}

async function prepareAlbumPhotoUpload(albumId) {
  const { data, error } = await supabase.rpc(
    'prepare_two_person_album_photo_upload',
    { p_album_id: albumId }
  );
  if (error) throw error;
  if (!data?.photo_id || !data?.storage_path) {
    throw new Error('Circles could not prepare this photo upload.');
  }
  return {
    photoId: data.photo_id,
    storagePath: data.storage_path,
  };
}

async function cancelAlbumPhotoUpload(photoId) {
  if (!photoId) return;
  await supabase.rpc('cancel_two_person_album_photo_upload', {
    p_photo_id: photoId,
  });
}

async function uploadOneAlbumPhoto({ albumId, asset }) {
  if (!asset?.uri) throw new Error('A selected photo is unavailable.');
  if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) {
    throw new Error('Shared albums currently support photos only.');
  }
  if (asset.fileSize && asset.fileSize > TWO_PERSON_ALBUM_SOURCE_LIMIT_BYTES) {
    throw new Error('Each selected photo must be 48 MB or smaller.');
  }

  const slot = await prepareAlbumPhotoUpload(albumId);
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
      .from(TWO_PERSON_ALBUM_BUCKET)
      .upload(slot.storagePath, decode(base64), {
        contentType: 'image/jpeg',
        upsert: false,
      });
    if (uploadError) throw uploadError;
    objectUploaded = true;

    const { data, error: finalizeError } = await supabase.rpc(
      'finalize_two_person_album_photo_upload',
      {
        p_photo_id: slot.photoId,
        p_width: asset.width || null,
        p_height: asset.height || null,
      }
    );
    if (finalizeError) throw finalizeError;

    return mapPhoto({
      photo_id: data?.photo_id || slot.photoId,
      album_id: albumId,
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
          .from(TWO_PERSON_ALBUM_BUCKET)
          .remove([slot.storagePath]);
      } catch {
        // The pending row is still cancelled below.
      }
    }
    try {
      await cancelAlbumPhotoUpload(slot.photoId);
    } catch {
      // Preserve the original upload error.
    }
    throw error;
  }
}

export async function uploadTwoPersonAlbumPhotos({
  albumId,
  assets,
  onProgress,
}) {
  await requireAlbumsFeature();
  const selected = Array.isArray(assets) ? assets : [];
  if (!albumId) throw new Error('Album is missing.');
  if (!selected.length) throw new Error('Choose at least one photo.');
  if (selected.length > TWO_PERSON_ALBUM_SELECTION_LIMIT) {
    throw new Error(
      `Choose up to ${TWO_PERSON_ALBUM_SELECTION_LIMIT} photos at a time.`
    );
  }

  const uploaded = [];
  for (let index = 0; index < selected.length; index += 1) {
    onProgress?.({ current: index + 1, total: selected.length });
    uploaded.push(await uploadOneAlbumPhoto({
      albumId,
      asset: selected[index],
    }));
  }
  return uploaded;
}

export async function deleteTwoPersonAlbumPhoto(photo) {
  await requireAlbumsFeature();
  if (!photo?.id || !photo?.storagePath) throw new Error('Photo is missing.');

  const { error: storageError } = await supabase.storage
    .from(TWO_PERSON_ALBUM_BUCKET)
    .remove([photo.storagePath]);
  if (storageError) throw storageError;

  const { data, error } = await supabase.rpc(
    'delete_two_person_album_photo',
    { p_photo_id: photo.id }
  );
  if (error) throw error;
  return Boolean(data);
}

export async function deleteTwoPersonAlbum(album) {
  await requireAlbumsFeature();
  if (!album?.id) throw new Error('Album is missing.');

  const paths = (album.photos || [])
    .map((photo) => photo.storagePath)
    .filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await supabase.storage
      .from(TWO_PERSON_ALBUM_BUCKET)
      .remove(paths);
    if (storageError) throw storageError;
  }

  const { data, error } = await supabase.rpc(
    'delete_two_person_circle_album',
    { p_album_id: album.id }
  );
  if (error) throw error;
  return Boolean(data);
}

export function subscribeToTwoPersonAlbumChanges({
  conversationId,
  onChange,
}) {
  if (!conversationId || typeof onChange !== 'function') return () => {};

  albumRealtimeCounter += 1;
  const suffix = `${Date.now()}_${albumRealtimeCounter}`;
  const channel = supabase
    .channel(`two_person_albums_${conversationId}_${suffix}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'two_person_circle_albums',
        filter: `conversation_id=eq.${conversationId}`,
      },
      onChange
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'two_person_circle_album_photos',
      },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
