# Circles Step 17 — Hot-path performance

Apply this patch **on top of the confirmed Step 16 state**.

## Database migration

This patch includes:

```text
supabase/migrations/20260804_078_hot_path_read_performance.sql
```

Apply Migration 078 before judging the full speed improvement:

```bash
npx supabase db push
```

The client contains compatibility fallbacks, so it will still run if the migration has not reached the database yet. The main Feed, Chat, and profile-post gains require Migration 078.

## What changed

### Feed

- A new `get_feed_v2` RPC returns the complete visible Feed card model in one read:
  - author
  - likes / liked-by-me
  - comment count
  - all media
  - crop and presentation metadata
- Removes the old follow-up reads for post metadata, media, and comments.
- Keeps a short warm Feed snapshot.
- Skips redundant focus reloads for 15 seconds.
- Debounces realtime bursts into one quiet refresh.
- Coalesces overlapping Feed requests.
- Adds conservative FlatList batching/windowing.

### Full profile post feed

- A new `get_profile_posts_v2` RPC returns all full post-card details for a profile in one request.
- Removes the previous `fetchPostDetail` request for every individual post when Migration 078 is present.
- Keeps a short warm snapshot and skips immediate refetches on quick returns.
- Coalesces overlapping loads and improves list batching.

### Chat

- A new `get_conversation_messages_v2` RPC returns messages and read-state counts together.
- Removes the second full read-state RPC from each Chat refresh.
- Quick returns within 12 seconds keep the existing message list instead of loading 100 messages again.
- Realtime message/read bursts are debounced.
- Message events refresh messages only; conversation/member changes trigger the heavier full refresh.
- Read-receipt events are now a separate opt-in subscription. A Chat ignores receipts for messages it is not displaying.
- Screens that only care about message content no longer refetch because an unrelated conversation was marked read.
- Conversation-specific membership/invitation/update listeners now use database filters.
- Global `message_media` listening is opt-in rather than automatically attached to every message subscriber.

### Inbox, Mutuals, Notifications, Events, galleries

- Short focus freshness windows prevent Back/forward navigation from forcing another full request immediately.
- Realtime bursts are debounced and overlapping requests are coalesced.
- Notifications now load 40 rows initially and paginate instead of reading 150 every time.
- Event lists/details/galleries skip redundant quick-return refreshes.
- Main list surfaces use restrained render windows/batches.

### Private media signing

- Concurrent requests for the same private object now share one in-flight signing request.
- A generation guard prevents a pending request from an old signed-in/dev account from repopulating the signed-URL cache after account switching.
- The cache remains memory-only and is cleared at account boundaries.

## Test sequence

After applying the files and Migration 078, fully relaunch the app.

1. Open Feed cold, then switch away and back several times.
2. Open a personal profile with many posts and tap the full Posts feed.
3. Return and reopen that feed.
4. Open a busy Chat, back out, and reopen it quickly.
5. Send/receive a message and verify it still appears through realtime updates.
6. Verify read labels still update in direct and group chats.
7. Open Inbox and Notifications repeatedly; scroll Notifications far enough to trigger pagination.
8. Open Circle Plans & Events → Event → Gallery → Back through the same route.
9. Switch between development accounts and confirm no previous-account private image briefly appears.

## Validation performed

- Node syntax checks for every changed JavaScript file
- iOS Expo/Hermes production export: 2,114 modules
- Scoped whitespace validation
- No native changes; no EAS rebuild is required

Do not push until the Feed, full profile-post feed, Chat realtime/read state, Notifications pagination, and account-switch privacy checks feel correct on-device.
