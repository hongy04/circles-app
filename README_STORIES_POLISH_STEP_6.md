# Circles Step 6 — Stories Polish

This checkpoint polishes the complete story flow while keeping the existing 30-second / 25 MB story-video limits.

## What changed

### Story rail

- Your active story is now combined with the **Your Story** item instead of appearing twice.
- The small plus badge opens the composer to add another story.
- Opening a story marks its ring as seen for the current app session.
- Story changes refresh through Supabase Realtime.

### Story viewer

- Tap left or right to move between stories.
- Press and hold to pause both photos and videos.
- Photo stories advance automatically after five seconds.
- Videos show real playback progress and advance when finished.
- Video mute/unmute control.
- Story media pauses while the app is in the background.
- Full-photo rendering uses `contain` so portrait and landscape photos are not aggressively cropped.
- Loading, retry, failed-media, and deleting states.
- Your own stories have a delete action.
- Top and bottom safe areas are respected on iPhone.

### Story composer

- Staged progress bar for preparing, uploading, and publishing.
- New uploads use user-owned paths:

  `stories/<user-id>/<filename>`

The progress bar represents upload stages rather than byte-level network progress. A later resumable-upload checkpoint can add exact transfer percentages for larger videos.

### Expiration

- Stories are kept in chronological order for each person.
- The Feed schedules a refresh when the next active story reaches its 24-hour expiration.
- Insert and delete events also refresh the rail automatically.

### Privacy and deletion

The migration removes old permissive development policies for the `stories` table and restores explicit rules:

- users may insert only their own stories;
- users may view their own or accepted connections' active stories;
- users may delete only their own stories;
- users may delete only Storage objects they uploaded to the `stories` bucket.

## Apply

Copy the package contents into the Circles project root and allow Windows to replace or merge files.

## Required migration

Run this file in the Supabase SQL Editor before testing story deletion:

`supabase/migrations/20260720_005_story_deletion_policy.sql`

## Test on iPhone 14

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

1. Add a photo story and confirm the staged progress bar appears.
2. Confirm **Your Story** shows the uploaded media with a small plus badge.
3. Open the story and confirm the full photo is visible without unwanted cropping.
4. Hold the story for at least a moment and confirm progress pauses.
5. Release and confirm progress resumes.
6. Add a second story and test left/right tapping between both items.
7. Add a video under 25 MB and 30 seconds.
8. Test pause, mute/unmute, and automatic advance at the end.
9. Put the app in the background briefly and confirm playback does not continue.
10. Delete one of your stories and confirm it disappears from the rail.
11. Close and reopen the Feed and confirm the deletion persisted.

## Test on web

```powershell
npx expo start --web --clear
```

Confirm story creation, viewing, retry states, navigation, mute, and deletion still work.

## Commit

```powershell
git status
git add App.js src supabase/migrations README_STORIES_POLISH_STEP_6.md
git commit -m "Polish story viewing and deletion"
git push
```
