# Step 34 Cleanup — Remove Circle Profile Living Doorway

This patch rolls back only the Step 34 "Shared History / Inside this Circle" preview from `CircleProfileScreen`.

## Why
The preview repeated information already available through the Timeline tab and made the Circle Profile feel more cluttered. The cleaner profile hierarchy is stronger: personalized identity/header first, posts and existing profile controls second, full shared history in Timeline when the user chooses to enter it.

## What stays
- Step 30 Timeline milestones, shared thoughts, completed plans, and event memories
- Step 31 linked-album multimedia plan memories
- Step 32 Timeline finishing polish
- Step 33 Circle posts in Feed and its navigation hotfix
- Existing Circle Profile Timeline grid and direct memory navigation
- All personalization / wallpaper / decoration work

## Replace
`src/screens/conversations/CircleProfileScreen.js`

## Backend / build
- No Supabase migration
- No Edge Function deploy
- No native change
- No EAS rebuild
