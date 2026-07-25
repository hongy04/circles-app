# Circles Step 5.1 — Profile Posts + iPhone Comments Fix

This patch fixes two issues found after Step 5 testing:

1. Your own post count could appear on the profile while the post thumbnails stayed empty.
2. The comments screen could sit under the iPhone status bar and its back control could feel unresponsive.

## Why the profile grid was empty

The profile header was loaded through a privacy-aware security-definer RPC, but the thumbnails were still loaded with direct reads from `posts` and `post_media`. Supabase RLS could filter those direct reads to zero rows even for a profile whose summary reported posts.

The new `get_profile_posts(profile_user_id)` RPC applies the Circles privacy rule on the server and returns each post's preview URL, media type, and media count.

## Comments changes

- iOS uses a native page-sheet comments modal.
- The modal gets its own safe-area provider.
- Both top and bottom safe areas are respected.
- The old small back icon is replaced with a 44×44 close button.
- The comments modal may be closed while a comment is still finishing its request.
- Android hardware back continues to use `onRequestClose`.

## Apply

Copy this package into the project root and allow Windows to replace/merge files.

## Run the migration

In Supabase SQL Editor, run:

`supabase/migrations/20260720_003_profile_posts_rpc.sql`

Run the migration before testing the profile grid.

## Test on iPhone 14

1. Open **Me** and confirm existing post thumbnails appear.
2. Tap a thumbnail and confirm Post Detail opens.
3. Open Feed comments.
4. Confirm the comments header is below the clock/Dynamic Island area.
5. Close with the X button.
6. Open comments, submit a comment, and close immediately; the modal should dismiss.
7. Confirm the comment is still present when reopening comments after the request finishes.

## Test web

```powershell
npx expo start --web --clear
```

Confirm profile thumbnails and comments still work.

## Test phone

```powershell
npx expo start --tunnel --clear
```

## Commit

```powershell
git status
git add App.js src supabase/migrations README_PROFILE_FIXES_STEP_5_1.md
git commit -m "Fix profile posts and comments modal"
git push
```
