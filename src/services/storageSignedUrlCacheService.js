import { supabase } from '../lib/supabase';

// Signed URLs are intentionally cached only in memory. They already carry an
// expiry, so there is no value in repeatedly asking Supabase Storage to sign
// the exact same private object while the user moves between nearby screens.
const cache = new Map();
const DEFAULT_SAFETY_WINDOW_MS = 5 * 60 * 1000;
const SIGN_BATCH_SIZE = 100;

function cacheKey(bucket, path) {
  return `${String(bucket || '')}:${String(path || '')}`;
}

function readCached(bucket, path, safetyWindowMs = DEFAULT_SAFETY_WINDOW_MS) {
  const key = cacheKey(bucket, path);
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt - Date.now() <= safetyWindowMs) {
    cache.delete(key);
    return null;
  }

  return entry.url;
}

function writeCached(bucket, path, url, expiresInSeconds) {
  if (!bucket || !path || !url) return;
  cache.set(cacheKey(bucket, path), {
    url,
    expiresAt: Date.now() + Math.max(60, Number(expiresInSeconds || 3600)) * 1000,
  });
}

export function clearStorageSignedUrlCache() {
  cache.clear();
}

export function removeStorageSignedUrlCacheEntries(bucket, paths = []) {
  for (const path of Array.isArray(paths) ? paths : []) {
    if (!path) continue;
    cache.delete(cacheKey(bucket, path));
  }
}

export async function getCachedSignedUrls(bucket, paths = [], expiresInSeconds = 3600) {
  const uniquePaths = Array.from(
    new Set((Array.isArray(paths) ? paths : []).map((path) => String(path || '').trim()).filter(Boolean))
  );

  const result = new Map();
  const missing = [];

  uniquePaths.forEach((path) => {
    const cached = readCached(bucket, path);
    if (cached) result.set(path, cached);
    else missing.push(path);
  });

  if (!missing.length) return result;

  const batches = [];
  for (let index = 0; index < missing.length; index += SIGN_BATCH_SIZE) {
    batches.push(missing.slice(index, index + SIGN_BATCH_SIZE));
  }

  const signedBatches = await Promise.all(batches.map(async (batch) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(batch, expiresInSeconds);
    if (error) throw error;
    return { batch, data: data || [] };
  }));

  signedBatches.forEach(({ batch, data }) => {
    data.forEach((item, index) => {
      const path = item?.path || batch[index];
      const url = item?.signedUrl || null;
      if (!path || !url) return;
      writeCached(bucket, path, url, expiresInSeconds);
      result.set(path, url);
    });
  });

  return result;
}

export async function getCachedSignedUrl(bucket, path, expiresInSeconds = 3600) {
  const cleanPath = String(path || '').trim();
  if (!cleanPath) return null;
  const urls = await getCachedSignedUrls(bucket, [cleanPath], expiresInSeconds);
  return urls.get(cleanPath) || null;
}
