# Circles — Feed Media Polish Step 4B

This checkpoint builds on the confirmed Step 4A commit.

## What changed

### Feed cards

- Multi-photo and multi-video posts now appear as a horizontal carousel directly in the feed.
- The feed batches post-media, author-ID, and comment-count lookups after the existing `get_feed` RPC. The existing RPC remains unchanged.
- Page count and dot indicators show carousel position.
- Only the visible post's active video autoplays, muted and looping.
- Video mute/unmute control is included.
- Double-tap still likes the post and persists through Supabase.
- Author avatar/name opens the author's profile.
- Captions collapse after 120 characters and include More/Less.
- Comment links now show actual comment counts and update after posting.
- Feed cards use a readable maximum width on desktop web.

### Story composer

- Tapping Your Story now opens a dedicated preview screen instead of immediately uploading.
- Users can choose, preview, change, and then share one photo or video.
- Video details show duration and file size when supplied by the device.
- Story validation happens before upload and again inside the service.
- Current limits:
  - Story video: 30 seconds and 25 MB
  - Story image: 15 MB

These are app-level limits and can be changed in `src/utils/mediaValidation.js`.

### Post composer validation

- Selected assets retain file-size metadata.
- Invalid media is rejected before upload.
- Current limits:
  - Maximum 10 items
  - Maximum 48 MB per item
  - Maximum 2 minutes per video
- Thumbnails display file size and video duration when available.

## New files

- `src/components/feed/PostMediaCarousel.js`
- `src/screens/stories/StoryComposerScreen.js`
- `src/utils/mediaValidation.js`

## Updated files

- `App.js`
- `src/components/feed/PostCard.js`
- `src/screens/feed/FeedScreen.js`
- `src/screens/posts/CreatePostScreen.js`
- `src/services/feedService.js`
- `src/services/postService.js`
- `src/services/storyService.js`

## Database changes

None. This step preserves the existing `get_feed`, `create_post_with_media`, and `get_active_stories` functions.

## Web test

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --web --clear
```

Test:

1. Log in with development code `000000`.
2. Create a post containing two or more photos.
3. Confirm the feed card can swipe between them.
4. Create a mixed photo/video post.
5. Confirm the active feed video plays muted and stops when its post leaves view.
6. Open an author's profile by selecting their name or avatar.
7. Add a comment and confirm the displayed comment count changes.
8. Open Your Story, choose media, preview it, and post it.
9. Try a video over 30 seconds or 25 MB and confirm it is rejected before upload.

## Phone test

```powershell
npx expo start --tunnel --clear
```

Also test:

- Horizontal swiping does not interfere with vertical feed scrolling.
- Double-tap like works on each carousel page.
- Video mute/unmute works.
- Feed video pauses when scrolling away.
- Story preview plays before posting.
- Photo and short-video stories upload successfully.

## Commit

```powershell
git status
git add App.js src README_FEED_MEDIA_STEP_4B.md
git commit -m "Polish feed media and story composer"
git push
```
