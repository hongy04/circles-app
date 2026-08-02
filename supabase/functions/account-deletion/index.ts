import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function listFolderPaths(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) throw new Error(`${bucket} listing failed: ${error.message}`);
    const rows = data || [];

    for (const row of rows) {
      const childPath = `${prefix}/${row.name}`;
      if (row.id) {
        paths.push(childPath);
      } else {
        paths.push(...await listFolderPaths(admin, bucket, childPath));
      }
    }

    if (rows.length < 1000) break;
    offset += rows.length;
  }

  return paths;
}

async function removePaths(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[],
) {
  const uniquePaths = [...new Set(paths.map((path) => String(path || '').trim()).filter(Boolean))];
  for (const batch of chunk(uniquePaths, 100)) {
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) throw new Error(`${bucket} cleanup failed: ${error.message}`);
  }
}

async function cleanStorage(
  admin: ReturnType<typeof createClient>,
  manifest: Record<string, unknown>,
) {
  const prefixRows = Array.isArray(manifest?.folder_prefixes)
    ? manifest.folder_prefixes
    : [];
  const objectRows = Array.isArray(manifest?.objects)
    ? manifest.objects
    : [];

  for (const rawRow of prefixRows) {
    const row = rawRow as { bucket?: unknown; prefix?: unknown };
    const bucket = String(row?.bucket || '').trim();
    const prefix = String(row?.prefix || '').trim().replace(/^\/+|\/+$/g, '');
    if (!bucket || !prefix) continue;

    const paths = await listFolderPaths(admin, bucket, prefix);
    await removePaths(admin, bucket, paths);
  }

  for (const rawRow of objectRows) {
    const row = rawRow as { bucket?: unknown; paths?: unknown };
    const bucket = String(row?.bucket || '').trim();
    const paths = Array.isArray(row?.paths)
      ? row.paths.map((path) => String(path || '').trim()).filter(Boolean)
      : [];
    if (!bucket || paths.length === 0) continue;
    await removePaths(admin, bucket, paths);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization') || '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('account-deletion is missing Supabase server credentials.');
    return jsonResponse({ error: 'Account deletion is unavailable.' }, 500);
  }

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }

  let payload: { confirmation?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Type DELETE to confirm account deletion.' }, 400);
  }

  if (String(payload?.confirmation || '').trim() !== 'DELETE') {
    return jsonResponse({ error: 'Type DELETE exactly to confirm.' }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return jsonResponse({ error: 'Your session expired. Sign in again before deleting the account.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let receiptId = '';

  try {
    const { data: prepared, error: preparationError } = await admin.rpc(
      'prepare_account_deletion',
      { p_user_id: user.id },
    );

    if (preparationError) throw new Error(preparationError.message);

    receiptId = String(prepared?.receipt_id || '').trim();
    if (!receiptId) throw new Error('Deletion receipt was not created.');

    await cleanStorage(
      admin,
      (prepared?.storage_manifest || {}) as Record<string, unknown>,
    );

    // Profile decoration lives in a private bucket introduced after the
    // original deletion manifest. Sweep the user's UUID prefix explicitly so
    // header/background images cannot survive account deletion.
    const profileDecorationPaths = await listFolderPaths(admin, 'profile-decor', user.id);
    await removePaths(admin, 'profile-decor', profileDecorationPaths);

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteAuthError) throw new Error(deleteAuthError.message);

    const { error: finalizationError } = await admin.rpc(
      'finalize_account_deletion',
      {
        p_receipt_id: receiptId,
        p_succeeded: true,
        p_error: null,
      },
    );

    if (finalizationError) {
      console.error('Account deleted but receipt finalization failed:', finalizationError.message);
    }

    return jsonResponse({ success: true, receipt_id: receiptId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account deletion failed.';
    console.error('Account deletion failed:', message);

    if (receiptId) {
      await admin.rpc('finalize_account_deletion', {
        p_receipt_id: receiptId,
        p_succeeded: false,
        p_error: message,
      });
    }

    return jsonResponse({
      error: 'Circles could not finish deleting this account. Nothing needs to be re-entered; try again.',
    }, 500);
  }
});
