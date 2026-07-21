# Circles Step 7 — Post Ownership and Management

This checkpoint adds owner-only caption editing and post deletion across Feed, Post Detail, and the current user's profile.

## What changed

### Owner menu

Your own posts now show a three-dot management button in:

- Feed
- Post Detail
- Your profile grid

The shared owner menu provides:

- **Edit caption**
- **Delete post**
- A destructive-action confirmation before deletion
- A visible deletion state that prevents duplicate actions

Other users do not receive management controls for posts they do not own.

### Caption editing

The new `EditPost` screen:

- loads only a post owned by the signed-in user;
- edits the caption without replacing the photos or videos;
- preserves likes and comments;
- enforces the existing 2,200-character limit;
- refreshes Feed, Profile, and Post Detail after returning.

### Post deletion

Deleting a post now:

1. verifies that the signed-in user owns it;
2. removes its uploaded files from the `posts` Storage bucket;
3. deletes the post through an owner-only RPC;
4. lets foreign-key cascades remove the related media rows, likes, and comments;
5. removes the post immediately from the visible Feed or profile grid.

Both legacy root-level uploads and new user-folder uploads are covered by the Storage owner policy.

### New post storage paths

New post media now uploads to:

`posts/<user-id>/<filename>`

If post creation fails after one or more uploads, the app attempts to remove those partial uploads so they do not remain as orphaned Storage files.

### Post Detail comments

The comment button and comment count now work in Post Detail using the same safe-area comments sheet and optimistic comment flow as Feed.

### Privacy cleanup

The migration removes restored permissive development policies for:

- posts;
- post media;
- comments;
- likes.

It preserves relationship-aware reading and restricts post updates/deletes to the post owner.

## Apply the package

Copy the package contents into the Circles project root and allow Windows to replace or merge the files:

`C:\Users\honge\Dev\circles-app`

## Required migration

Before testing post management, run this file in Supabase SQL Editor:

`supabase/migrations/20260720_006_post_ownership.sql`

The app management actions depend on the two new RPCs and the post Storage deletion policy.

## Test on iPhone 14

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

Test this sequence:

1. Create a new photo post.
2. Confirm the new post appears in Feed and on your profile.
3. In Feed, tap the three-dot button on your post.
4. Choose **Edit caption**, change it, save, and confirm Feed updates.
5. Open the same post from your profile and confirm the edited caption appears in Post Detail.
6. Open comments from Post Detail, add a comment, close the sheet, and reopen it.
7. Return to your profile and open the post's grid management button.
8. Choose **Delete post**, cancel once, then repeat and confirm deletion.
9. Confirm the post disappears from your profile and Feed.
10. Refresh both screens and confirm it remains deleted.
11. In Supabase Storage, confirm that the deleted post's media object is gone.
12. Create another post and verify its Storage path begins with your user ID.

## Test on web

```powershell
npx expo start --web --clear
```

Confirm that the owner menu, caption editing, deletion confirmation, Post Detail comments, Feed refresh, and profile refresh all work with mouse input.

## Validation performed

- All 44 application JavaScript files passed Expo Babel transformation.
- The full Expo web export was started twice but did not finish within the container bundling timeout, so local web and physical-device testing remain required.
- Live Supabase migration behavior and Storage deletion must be confirmed in your project.

## Commit after testing

```powershell
git status
git add App.js src supabase/migrations README_POST_OWNERSHIP_STEP_7.md
git commit -m "Add post ownership and management"
git push
```
