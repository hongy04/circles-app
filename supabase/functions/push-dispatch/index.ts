import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_SEND_BATCH = 100;
const MAX_RECEIPT_BATCH = 1000;
const MAX_DISPATCH_BATCHES_PER_RUN = 5;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function expoHeaders(accessToken: string | undefined) {
  return {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

type DeliveryJob = {
  job_id: string;
  push_device_id: string;
  expo_push_token: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  attempt_count: number;
};

type ReceiptJob = {
  job_id: string;
  push_device_id: string;
  expo_ticket_id: string;
};

async function completeDeliveries(
  admin: ReturnType<typeof createClient>,
  results: Record<string, unknown>[],
) {
  if (results.length === 0) return;
  const { error } = await admin.rpc('complete_push_delivery_batch', {
    p_results: results,
  });
  if (error) throw new Error(`Could not record push tickets: ${error.message}`);
}

async function completeReceipts(
  admin: ReturnType<typeof createClient>,
  results: Record<string, unknown>[],
) {
  if (results.length === 0) return;
  const { error } = await admin.rpc('complete_push_receipt_batch', {
    p_results: results,
  });
  if (error) throw new Error(`Could not record push receipts: ${error.message}`);
}

async function dispatchPending(
  admin: ReturnType<typeof createClient>,
  expoAccessToken: string | undefined,
) {
  let claimedCount = 0;
  let ticketCount = 0;
  let retryCount = 0;
  let failedCount = 0;

  for (let batchIndex = 0; batchIndex < MAX_DISPATCH_BATCHES_PER_RUN; batchIndex += 1) {
    const { data, error } = await admin.rpc('claim_push_delivery_jobs', {
      p_limit_count: MAX_SEND_BATCH,
    });
    if (error) throw new Error(`Could not claim push jobs: ${error.message}`);

    const jobs = (data || []) as DeliveryJob[];
    if (jobs.length === 0) break;
    claimedCount += jobs.length;

    for (const jobsChunk of chunk(jobs, MAX_SEND_BATCH)) {
      const messages = jobsChunk.map((job) => ({
        to: job.expo_push_token,
        title: job.title,
        body: job.body,
        sound: 'default',
        priority: 'high',
        data: job.payload || {},
        channelId: 'circles-activity',
      }));

      let response: Response;
      try {
        response = await fetch(EXPO_SEND_URL, {
          method: 'POST',
          headers: expoHeaders(expoAccessToken),
          body: JSON.stringify(messages),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Expo Push Service network error';
        const results = jobsChunk.map((job) => ({
          job_id: job.job_id,
          status: 'retry',
          error_code: 'NetworkError',
          error_message: message,
        }));
        retryCount += results.length;
        await completeDeliveries(admin, results);
        continue;
      }

      if (!response.ok) {
        const responseText = (await response.text()).slice(0, 1000);
        const retryable = response.status === 429 || response.status >= 500;
        const results = jobsChunk.map((job) => ({
          job_id: job.job_id,
          status: retryable ? 'retry' : 'failed',
          error_code: `ExpoHTTP${response.status}`,
          error_message: responseText || response.statusText,
        }));
        if (retryable) retryCount += results.length;
        else failedCount += results.length;
        await completeDeliveries(admin, results);
        continue;
      }

      const responseBody = await response.json().catch(() => ({}));
      const tickets = Array.isArray(responseBody?.data)
        ? responseBody.data
        : responseBody?.data
          ? [responseBody.data]
          : [];

      const results = jobsChunk.map((job, index) => {
        const ticket = tickets[index];
        if (ticket?.status === 'ok' && ticket?.id) {
          ticketCount += 1;
          return {
            job_id: job.job_id,
            status: 'ticket',
            ticket_id: String(ticket.id),
          };
        }

        const errorCode = String(ticket?.details?.error || 'ExpoTicketError');
        const errorMessage = String(ticket?.message || 'Expo rejected the push notification.');
        const disableDevice = errorCode === 'DeviceNotRegistered';
        failedCount += 1;
        return {
          job_id: job.job_id,
          status: 'failed',
          error_code: errorCode,
          error_message: errorMessage,
          disable_device: disableDevice,
        };
      });

      await completeDeliveries(admin, results);
    }
  }

  return { claimedCount, ticketCount, retryCount, failedCount };
}

async function checkReceipts(
  admin: ReturnType<typeof createClient>,
  expoAccessToken: string | undefined,
) {
  const { data, error } = await admin.rpc('claim_push_receipt_jobs', {
    p_limit_count: MAX_RECEIPT_BATCH,
  });
  if (error) throw new Error(`Could not claim push receipts: ${error.message}`);

  const jobs = (data || []) as ReceiptJob[];
  if (jobs.length === 0) {
    return { claimedCount: 0, completeCount: 0, pendingCount: 0, failedCount: 0 };
  }

  let completeCount = 0;
  let pendingCount = 0;
  let failedCount = 0;

  for (const jobsChunk of chunk(jobs, MAX_RECEIPT_BATCH)) {
    let response: Response;
    try {
      response = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: expoHeaders(expoAccessToken),
        body: JSON.stringify({
          ids: jobsChunk.map((job) => job.expo_ticket_id),
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Expo receipt network error';
      const results = jobsChunk.map((job) => ({
        job_id: job.job_id,
        status: 'pending',
        error_code: 'NetworkError',
        error_message: message,
      }));
      pendingCount += results.length;
      await completeReceipts(admin, results);
      continue;
    }

    if (!response.ok) {
      const responseText = (await response.text()).slice(0, 1000);
      const results = jobsChunk.map((job) => ({
        job_id: job.job_id,
        status: 'pending',
        error_code: `ExpoHTTP${response.status}`,
        error_message: responseText || response.statusText,
      }));
      pendingCount += results.length;
      await completeReceipts(admin, results);
      continue;
    }

    const responseBody = await response.json().catch(() => ({}));
    const receipts = responseBody?.data || {};

    const results = jobsChunk.map((job) => {
      const receipt = receipts[job.expo_ticket_id];
      if (!receipt) {
        pendingCount += 1;
        return { job_id: job.job_id, status: 'pending' };
      }

      if (receipt.status === 'ok') {
        completeCount += 1;
        return { job_id: job.job_id, status: 'ok' };
      }

      const errorCode = String(receipt?.details?.error || 'ExpoReceiptError');
      const errorMessage = String(receipt?.message || 'Push provider rejected the notification.');
      failedCount += 1;
      return {
        job_id: job.job_id,
        status: 'error',
        error_code: errorCode,
        error_message: errorMessage,
      };
    });

    await completeReceipts(admin, results);
  }

  return {
    claimedCount: jobs.length,
    completeCount,
    pendingCount,
    failedCount,
  };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const expectedSecret = Deno.env.get('PUSH_DISPATCH_SECRET');
  const suppliedSecret = request.headers.get('x-circles-dispatch-secret') || '';
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return jsonResponse({ error: 'Unauthorized.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN') || undefined;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('push-dispatch is missing Supabase server credentials.');
    return jsonResponse({ error: 'Push delivery is unavailable.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const payload = await request.json().catch(() => ({}));
    const action = String(payload?.action || 'all');

    const dispatch = action === 'receipts'
      ? null
      : await dispatchPending(admin, expoAccessToken);
    const receipts = action === 'dispatch'
      ? null
      : await checkReceipts(admin, expoAccessToken);

    return jsonResponse({ success: true, dispatch, receipts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push dispatcher failed.';
    console.error(message);
    return jsonResponse({ error: message }, 500);
  }
});
