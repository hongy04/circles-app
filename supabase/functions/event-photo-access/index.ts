import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

const SIGNED_URL_TTL_SECONDS = 10 * 60;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('event-photo-access is missing Supabase server credentials.');
    return jsonResponse({ error: 'Photo delivery is unavailable.' }, 500);
  }

  let payload: { token?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'A guest invitation token is required.' }, 400);
  }

  const token = String(payload?.token || '').trim().toLowerCase();
  if (!TOKEN_PATTERN.test(token)) {
    return jsonResponse({
      valid: false,
      reason: 'not_found',
      photo_count: 0,
      photos: [],
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: gallery, error: galleryError } = await admin.rpc(
    'list_event_guest_photos',
    { p_token: token },
  );

  if (galleryError) {
    console.error('Guest gallery lookup failed:', galleryError.message);
    return jsonResponse({ error: 'Photo delivery is unavailable.' }, 500);
  }

  if (!gallery?.valid) {
    return jsonResponse({
      valid: false,
      reason: gallery?.reason || 'not_found',
      photo_count: 0,
      photos: [],
    });
  }

  const sourcePhotos = Array.isArray(gallery?.photos) ? gallery.photos : [];
  const storagePaths = sourcePhotos
    .map((photo) => String(photo?.storage_path || '').trim())
    .filter(Boolean);

  if (storagePaths.length === 0) {
    return jsonResponse({
      valid: true,
      reason: null,
      photo_count: 0,
      expires_in: SIGNED_URL_TTL_SECONDS,
      photos: [],
    });
  }

  const { data: signedRows, error: signingError } = await admin.storage
    .from('event-media')
    .createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);

  if (signingError) {
    console.error('Guest photo signing failed:', signingError.message);
    return jsonResponse({ error: 'Photo delivery is unavailable.' }, 500);
  }

  const signedByPath = new Map<string, string>();
  for (const row of signedRows || []) {
    const path = String(row?.path || '').trim();
    const signedUrl = String(row?.signedUrl || row?.signedURL || '').trim();
    if (path && signedUrl) signedByPath.set(path, signedUrl);
  }

  const photos = sourcePhotos.flatMap((photo, index) => {
    const storagePath = String(photo?.storage_path || '').trim();
    const signedUrl = signedByPath.get(storagePath);
    if (!storagePath || !signedUrl) return [];

    return [{
      id: `event-photo-${index + 1}`,
      signed_url: signedUrl,
      width: photo?.width ?? null,
      height: photo?.height ?? null,
      created_at: photo?.created_at ?? null,
    }];
  });

  return jsonResponse({
    valid: true,
    reason: null,
    photo_count: photos.length,
    expires_in: SIGNED_URL_TTL_SECONDS,
    photos,
  });
});
