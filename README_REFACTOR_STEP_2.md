# Circles Refactor — Step 2

This step extracts shared UI components from `App.js` without moving screens or navigation.

## Extracted components

- `src/components/Avatar.js`
- `src/components/DevBanner.js`
- `src/components/MonoRingWithRipples.js`
- `src/components/UnreadBadge.js`
- `src/components/feed/PostCard.js`
- `src/components/stories/StoriesRail.js`
- `src/components/stories/StoryViewer.js`
- `src/utils/getInitials.js`

## Apply

Copy `App.js` and the `src` directory into the repository root, allowing files to merge.

## Test checklist

1. Welcome portal animation
2. Development login on web and phone
3. Mutuals avatars
4. Feed post card, likes, comments, and double-tap heart
5. Stories rail and story viewer
6. Circles inbox avatars and unread badge
7. Profile avatars

## Commit

```powershell
git add App.js src README_REFACTOR_STEP_2.md
git commit -m "Extract shared UI components"
git push
```
