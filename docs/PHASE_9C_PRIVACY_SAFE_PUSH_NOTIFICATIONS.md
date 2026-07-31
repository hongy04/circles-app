# Circles Phase 9C — Privacy-Safe Push Notifications

## Purpose

Circles already has a private in-app notification source of truth. Phase 9C
adds device delivery without copying sensitive content or server credentials
into the mobile app.

The system supports the notification activity that exists today:

- direct and Circle messages
- Circle invitations
- Circle posts, comments, and likes
- personal-post comments and likes
- incoming connection requests
- completed safety-report reviews
- completed account-action appeals
- completed birth-date correction reviews

Event-specific push alerts are not invented in this phase. When event activity
later creates a private in-app notification row, it can use this same delivery
pipeline.

## Privacy boundary

Push payloads never contain:

- message text or media
- report reasons, evidence, or target identities
- birth dates
- private romantic choices or state
- private moderation notes or staff identities
- service-role keys or Expo server credentials

Circle names are omitted from lock-screen text. Safety outcomes use broad system
wording. The app resolves the private destination only after the signed-in user
opens the notification.

Conversation mute and member-specific notification preferences remain the
source of truth. Muting suppresses message and Circle activity delivery but does
not erase unread history. Safety outcomes are not suppressed by a conversation
mute.

## Architecture

### Mobile client

`expo-notifications` requests permission, creates the Android notification
channel, mints an Expo push token for the EAS project, and registers it through a
narrow authenticated RPC.

A token belongs to the currently signed-in account on that physical app
installation. Signing out or switching a development account disables that
registration. Registering the same token under a new account safely transfers
it and cancels unsent jobs for the previous account.

### Database

`push_devices` stores enabled per-account device tokens. Clients cannot query the
table directly.

`push_delivery_jobs` stores idempotent delivery work. Clients cannot query the
table directly. Trigger functions create jobs from existing private activity,
and service-role-only functions claim and complete work.

### Edge Function

`push-dispatch` holds all trusted delivery behavior. It:

1. authenticates a scheduler-specific secret;
2. claims up to 100 delivery jobs at a time;
3. sends them to the Expo Push Service;
4. records Expo push tickets;
5. checks receipts after 15 minutes;
6. disables tokens rejected as `DeviceNotRegistered`;
7. retries temporary errors with bounded backoff; and
8. expires receipt checks after 24 hours.

The mobile client never receives the service-role key, scheduler secret, or
optional Expo access token.

## Files

- `.env.example`
- `App.js`
- `app.json`
- `eas.json`
- `package.json`
- `src/config/env.js`
- `src/navigation/rootNavigation.js`
- `src/screens/profile/AccountSettingsScreen.js`
- `src/screens/profile/PushNotificationSettingsScreen.js`
- `src/services/devTestService.js`
- `src/services/profileService.js`
- `src/services/pushNotificationService.js`
- `supabase/functions/push-dispatch/index.ts`
- `supabase/migrations/20260729_063_privacy_safe_push_notifications.sql`

## Installation and deployment

### 1. Install native dependencies

```bash
npx expo install expo-notifications expo-constants
```

This updates the local lockfile for the exact Expo SDK version.

### 2. Initialize/link the EAS project

```bash
npx eas-cli@latest init
npx eas-cli@latest project:info
```

Copy the project ID into `.env.local`:

```env
EXPO_PUBLIC_EAS_PROJECT_ID=YOUR_EAS_PROJECT_ID
```

The app also recognizes the project ID injected by EAS, but the explicit public
environment value keeps local configuration clear.

### 3. Run Migration 063

Run:

```text
supabase/migrations/20260729_063_privacy_safe_push_notifications.sql
```

### 4. Create a dispatcher secret

Generate a strong random value locally:

```bash
openssl rand -hex 32
```

Store the same value as an Edge Function secret:

```bash
npx supabase secrets set PUSH_DISPATCH_SECRET=YOUR_RANDOM_SECRET
```

When Expo push security is enabled for the Expo project, also store its access
token:

```bash
npx supabase secrets set EXPO_ACCESS_TOKEN=YOUR_EXPO_ACCESS_TOKEN
```

### 5. Deploy the dispatcher

The endpoint is intentionally deployed without Supabase JWT verification because
it is called by a database scheduler rather than an end user. The independent
`PUSH_DISPATCH_SECRET` is required on every request.

```bash
npx supabase functions deploy push-dispatch --no-verify-jwt
```

### 6. Store scheduler values in Vault

Replace the placeholders and run once in Supabase SQL Editor:

```sql
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'circles_project_url'
);

select vault.create_secret(
  'YOUR_RANDOM_SECRET',
  'circles_push_dispatch_secret'
);
```

### 7. Schedule dispatch and receipt checks

Enable `pg_cron`, `pg_net`, and Vault in Supabase, then run:

```sql
select cron.schedule(
  'circles-push-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'circles_project_url'
      limit 1
    ) || '/functions/v1/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-circles-dispatch-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'circles_push_dispatch_secret'
        limit 1
      )
    ),
    body := '{"action":"all"}'::jsonb
  );
  $$
);
```

Confirm the job exists:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'circles-push-dispatch';
```

### 8. Create an installed test build

Remote push notifications require an installed iOS or Android build. Expo Go is
not the test target for this phase.

For an internal Android APK:

```bash
npx eas-cli@latest build --profile preview --platform android
```

For an internal iOS build:

```bash
npx eas-cli@latest build --profile preview --platform ios
```

Complete the platform notification-credential prompts. Test on a physical
device.

## Test sequence

1. Install the preview build on a physical device.
2. Sign in and open **Settings → Push notifications**.
3. Enable notifications and accept the operating-system permission.
4. Confirm the page reports one registered device.
5. Put Circles in the background or close it.
6. From another account, send a connection request.
7. Confirm a generic connection-request push arrives and opens Mutuals.
8. Send a direct message and confirm the push contains no message text.
9. Open a Circle, mute it, and confirm later messages/activity from that Circle do
   not produce pushes while unread history remains visible in the app.
10. Resolve a safety report, appeal, or age-correction request and confirm the
    push contains only broad completion wording.
11. Tap each push and confirm it opens the correct private destination.
12. Switch development accounts on the same installation and confirm the token
    moves to the newly signed-in account.
13. Sign out and confirm the current registration is disabled.
14. Delete a disposable account and confirm its device rows and pending jobs are
    removed.

## Verification queries

### Registered devices

```sql
select
  user_id,
  platform,
  enabled,
  last_seen_at,
  disabled_reason
from public.push_devices
order by last_seen_at desc;
```

Do not share or log full Expo push tokens outside trusted administration.

### Delivery jobs

```sql
select
  source_kind,
  notification_type,
  status,
  attempt_count,
  ticket_error_code,
  receipt_status,
  receipt_error_code,
  created_at,
  completed_at
from public.push_delivery_jobs
order by created_at desc
limit 100;
```

Healthy delivered rows move through:

```text
pending → sending → ticket → receipt_checking → complete
```

### Invalid-token cleanup

```sql
select
  platform,
  enabled,
  disabled_reason,
  disabled_at
from public.push_devices
where disabled_reason = 'DeviceNotRegistered'
order by disabled_at desc;
```

### Direct client access boundary

```sql
select
  has_table_privilege('anon', 'public.push_devices', 'SELECT')
    as anon_can_read_devices,
  has_table_privilege('authenticated', 'public.push_devices', 'SELECT')
    as authenticated_can_read_devices,
  has_table_privilege('anon', 'public.push_delivery_jobs', 'SELECT')
    as anon_can_read_jobs,
  has_table_privilege('authenticated', 'public.push_delivery_jobs', 'SELECT')
    as authenticated_can_read_jobs;
```

All four values should be `false`.

### Dispatcher invocation history

```sql
select
  id,
  status_code,
  created
from net._http_response
order by created desc
limit 20;
```

A successful scheduled invocation returns HTTP `200`.

## Operational notes

- Expo push tickets acknowledge acceptance by the Expo Push Service, not final
  device delivery. Receipts are the final server-side signal.
- `DeviceNotRegistered` disables the device row so Circles stops sending to an
  invalid installation.
- The queue is idempotent per source and device.
- No push is a source of truth. The app always reloads the protected private
  destination after the user opens it.
