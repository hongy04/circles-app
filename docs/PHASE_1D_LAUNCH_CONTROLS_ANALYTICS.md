# Circles Phase 1D — Launch Controls and Privacy-safe Analytics

## Purpose

Phase 1 now has enough real behavior to evaluate: invitation links, Mutuals discovery, selected preview posts, pre-connection profile shells, and accepted Connections. This checkpoint adds the controls and measurements needed to test those flows without introducing a third-party tracking SDK.

## Remote feature controls

Migration `20260725_022_launch_controls_analytics.sql` creates four server-backed flags:

- `launch_invitations`
- `mutual_preview_posts`
- `preconnection_profile_shell`
- `launch_analytics`

All four begin enabled. They are read through `get_app_feature_flags()`; the mobile client has no direct table access.

To pause a feature from the Supabase SQL Editor:

```sql
update public.app_feature_flags
set enabled = false, updated_at = now()
where flag_key = 'mutual_preview_posts';
```

Re-enable it by setting `enabled = true`. The client caches flags for up to one minute.

Existing invitation links remain previewable and redeemable if creation of new links is paused. This avoids invalidating invitations people have already received.

## First-party analytics

The new `app_analytics_events` table records only a narrow allowlist of Phase 1 events:

- invitation created, shared, previewed, and redeemed;
- Mutuals opened;
- Mutuals preview selected or cleared;
- pre-connection profile shell opened;
- connection request sent, accepted, or declined;
- private Circle member invitations sent.

The client and database both enforce property allowlists. The tracking path cannot store:

- phone numbers or contact names;
- invitation tokens or URLs;
- captions, bios, messages, or search text;
- target profile IDs or Circle IDs;
- arbitrary user-supplied metadata.

Authenticated events receive `actor_id` from `auth.uid()` on the server. Anonymous invitation previews may have a null actor. The mobile client has no direct read access to analytics rows.

Tracking is best effort. A missing migration, disabled analytics flag, network failure, or rejected event never interrupts the user’s action.

## Useful launch queries

Event totals by day:

```sql
select
  date_trunc('day', created_at) as day,
  event_name,
  count(*) as events
from public.app_analytics_events
group by 1, 2
order by 1 desc, 2;
```

Invitation outcomes:

```sql
select
  properties->>'invite_kind' as invite_kind,
  properties->>'outcome' as outcome,
  count(*) as redemptions
from public.app_analytics_events
where event_name = 'invite_redeemed'
group by 1, 2
order by 1, 3 desc;
```

Connection-request acceptance and decline counts:

```sql
select
  properties->>'action' as action,
  count(*) as responses
from public.app_analytics_events
where event_name = 'connection_request_responded'
group by 1;
```

## Manual test

1. Run migration 022.
2. Restart Expo with a cleared cache.
3. Open Mutuals, open a pre-connection profile, send a request, and respond from the other account.
4. Create and share a personal invitation.
5. Select or clear a Mutuals preview post.
6. In Supabase SQL Editor, run:

```sql
select event_name, properties, created_at
from public.app_analytics_events
order by created_at desc
limit 30;
```

Confirm the expected event names appear and that no phone numbers, tokens, captions, profile IDs, or message content are present.
