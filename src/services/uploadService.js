import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';

export function normalizeMime(mime) {
  if (!mime) return 'image/jpeg';
  if (mime === 'video/quicktime') return 'video/mp4';
  return mime;
}

export async function compressIfImage(uri, mimeHint = 'image/jpeg') {
  const mime = normalizeMime(mimeHint);

  if (!mime.startsWith('image/')) {
    return { uri, mime };
  }

  const { uri: outputUri } = await ImageManipulator.manipulateAsync(
    uri,
    [],
    {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return {
    uri: outputUri,
    mime: 'image/jpeg',
  };
}

export async function uploadToBucket(
  uri,
  bucket,
  mimeHint = 'image/jpeg'
) {
  await ensureAuthed();

  const { uri: uploadUri, mime: rawMime } = await compressIfImage(
    uri,
    mimeHint
  );

  const mime = normalizeMime(rawMime);
  const extension = mime.startsWith('video/') ? 'mp4' : 'jpg';
  const path = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.${extension}`;

  const base64 = await FileSystem.readAsStringAsync(uploadUri, {
    encoding: 'base64',
  });

  const arrayBuffer = decode(base64);

  const { error } = await supabase.storage.from(bucket).upload(
    path,
    arrayBuffer,
    {
      contentType: mime,
      upsert: false,
    }
  );

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
