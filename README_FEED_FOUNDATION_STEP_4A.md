# Circles Feed Foundation — Step 4A

This checkpoint starts the feature-polish phase while keeping the existing database schema and RPC contracts intact.

## What moved out of App.js

- `src/screens/feed/FeedScreen.js`
- `src/screens/posts/CreatePostScreen.js`
- `src/screens/posts/PostDetailScreen.js`

`App.js` now imports those screens and remains the root/navigation assembly file.

## New service layer

- `src/services/feedService.js`
  - feed pagination
  - comments loading
  - comment creation
  - like toggling
- `src/services/postService.js`
  - post creation and upload progress
  - post-detail loading
- `src/services/storyService.js`
  - active-story loading
  - story upload and database insertion

## Reliability fixes

- Feed realtime cleanup is now returned directly from the React effect.
- Feed supports initial loading, retry, empty, refresh, pagination, and non-blocking error states.
- Feed refreshes when it regains focus, including after creating a post.
- Optimistic likes roll back when the server request fails.
- Double-tap likes now reach Supabase instead of changing only local state.
- Optimistic comments are replaced with server data after success and rolled back after failure.
- Story insertion errors are checked instead of silently ignored.
- Story uploading displays a loading state.
- Post Detail has loading, retry, author, media paging, and like rollback states.
- Post creation displays item-by-item upload progress and prevents duplicate submissions.

## Small interface improvements

- Feed header and empty state
- Single-tap a feed image to open Post Detail
- Double-tap a feed image to like it
- Remove selected media before posting
- Selected-media order badges
- Video placeholders in the post composer
- Multi-media counter in Post Detail

## Intentionally deferred to Step 4B

The current `get_feed` RPC returns only the first media URL for each post. Feed cards therefore still display the first media item only. Step 4B will add a versioned feed RPC that returns the full media array and comment count so feed cards can become swipeable carousels without breaking the working backend function.

## Test checklist

### Web

1. Sign in using development verification.
2. Open Feed and confirm loading completes.
3. Switch away from Feed and back; confirm it refreshes without duplicating posts.
4. Create a photo post and confirm upload progress appears.
5. Confirm returning from the composer refreshes Feed.
6. Single-click the post image and confirm Post Detail opens.
7. Like and unlike the post.
8. Open comments and add a comment.
9. Add a story and confirm the posting spinner clears.
10. Open the story viewer and move forward/backward.

### Phone

Repeat the web tests, then also verify:

- pull-to-refresh
- double-tap heart animation and persisted like
- multi-photo post creation
- media paging in Post Detail
- story photo/video upload
- app remains stable after leaving and returning to Feed several times

## Commit

After web and phone tests pass:

```powershell
git add App.js src README_FEED_FOUNDATION_STEP_4A.md
git commit -m "Build reliable feed and post foundation"
git push
```
