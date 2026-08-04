# Circles Step 18 — Render & Realtime Performance

Apply this patch on top of the confirmed Step 17 state.

## Purpose

Steps 16–17 reduced backend/network work. Step 18 reduces the remaining React Native render churn so those gains stay smooth while scrolling, typing, opening comments, and receiving realtime updates.

## Changes

### Chat
- Extracts a memoized message row so composer keystrokes do not rerender the visible message history.
- Reuses unchanged message objects after realtime/background refreshes.
- Only messages whose content, media, or read state changed rerender.
- Keeps immediate message refs synchronized after sending and unsending.

### Feed
- Uses memoized post rows.
- Changing visible video/playback state only updates affected rows.
- Quiet refreshes preserve unchanged post objects.
- Avoids redundant visibility-state updates when the same rows remain visible.

### Personal post feed
- Memoizes full-feed post rows.
- Preserves unchanged posts after refresh.
- Keeps optimistic likes local to the affected post.

### Circle Posts
- Memoizes Circle post rows.
- Adds request coalescing, a short focus freshness window, and realtime debouncing.
- Preserves unchanged post objects after refresh.
- Keeps like work isolated to the affected row.

### Circle Timeline
- Memoizes timeline cards.
- Adds request coalescing, a short focus freshness window, and realtime debouncing.
- Preserves unchanged media rows after refresh.
- Tightens FlatList rendering batches.

### Inbox and Notifications
- Reuses unchanged conversations, invitations, and notification rows.
- Memoizes row components so header/badge/refresh state changes do not rebuild the entire visible list.

### Shared
- Memoizes Avatar rendering across the app.
- Adds `src/utils/reconcileRows.js`, a small memory-only structural-sharing helper.

## No migration / native rebuild

- No Supabase migration.
- No native module changes.
- No EAS rebuild required.

## Suggested test

1. Open a busy Chat and type a long message quickly. Scrolling/typing should remain smooth.
2. Receive/send messages and verify read labels and unsend behavior.
3. Scroll Feed through several image/video posts; open comments and close them.
4. Open a personal profile's full post feed and like a post.
5. Open Circle Posts, go Back, reopen quickly, and test likes/comments.
6. Open Circle Timeline, Back, and reopen quickly.
7. Open Notifications, mark one read, scroll, and paginate.
8. Open Inbox and trigger a realtime message/unread update.

## Validation performed

- JavaScript syntax checks: passed
- Scoped whitespace validation: passed
- iOS Expo/Hermes production export: 2,115 modules, passed
