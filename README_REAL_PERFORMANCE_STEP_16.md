# Circles Step 16 — Real Load Performance

Apply this patch **on top of the confirmed Step 15 state**.

This checkpoint targets actual request/network cost rather than changing loader presentation.

## What changed

### Private signed media URLs are now batched + memory-cached

A new session-only `storageSignedUrlCacheService` reuses still-valid signed URLs and signs missing paths in batches rather than one object at a time.

This affects:

- private conversation / Circle media
- Circle avatars in the Circles inbox
- Circle header/background/custom-sticker assets
- personal profile header/background/custom-sticker assets
- event gallery photos

The cache is memory-only and is cleared on sign-out / development account switching.

### Circle posts no longer sign each post separately

`listCirclePosts()` now flattens media across the whole page and hydrates it in batches. A feed with dozens of media-bearing posts no longer makes one Storage signing request per post.

### Migration 077 removes an extra post-metadata query

`get_circle_posts` and `get_circle_post` now return:

- `display_aspect_ratio`
- `media_crop_points`
- `media_presentations`

directly, eliminating the follow-up `conversation_posts` lookup after every Circle post read.

The app contains a compatibility fallback if the migration has not been applied yet, but apply Migration 077 before judging the full speed improvement.

### Circle Profile removes an avoidable network waterfall

Circle identity, timeline, posts, and decoration now begin loading together instead of:

1. wait for Circle identity
2. then begin everything else

On Our Circle, posts/timeline become visible as soon as core content is ready; Plans/Dates/Albums/Thoughts no longer delay them.

### Circle theme requests stop competing with normal navigation

A recently resolved Circle theme is reused for 60 seconds. Realtime still catches actual Circle changes, but quick Profile → Plans → Back hops no longer fire a fresh theme RPC every time.

### Personal Profile paints core content before secondary controls

Profile identity, decoration, posts and social stats render as soon as ready. Mutual-preview state and romance / two-person-Circle controls hydrate afterward instead of delaying the whole profile.

## Migration

Apply:

`supabase/migrations/20260803_077_circle_post_read_performance.sql`

Use the same migration workflow you have been using for the other Circles migrations.

## Test sequence

1. Fully reload Circles.
2. Open the Circles tab and judge how quickly Circle avatars settle.
3. Cold-open a Circle with several posts/media items.
4. Open Posts, Back, Plans & Events, Back, People, Back.
5. Open the same Circle again and compare warm navigation.
6. Open a decorated personal profile with several posts.
7. Back out and reopen it.
8. Open an Event Photo Gallery, back out, and reopen it.
9. If convenient, switch dev accounts and verify private images from the prior account never flash.

## Validation run

- Changed-file JS syntax: passed
- Scoped `git diff --check`: passed
- iOS Expo/Hermes production export: passed
- Metro bundle: 2,114 modules
- No native module changes; no EAS rebuild required
