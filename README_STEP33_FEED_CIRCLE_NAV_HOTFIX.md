# Step 33 — Feed Circle Navigation Hotfix

Fixes the React Navigation warning when opening a Circle post from the main Feed.

## Root cause
`FeedScreen` was mounted directly as the Feed tab, while `CirclePostDetail`, `EditCirclePost`, and `ConversationMedia` only existed inside the sibling Circles stack. A direct `navigation.navigate('CirclePostDetail')` from Feed therefore had no matching route in its navigator ancestry.

## Fix
- Adds a small `FeedStack` under the Feed tab.
- Registers `CirclePostDetail`, `EditCirclePost`, and `ConversationMedia` in that stack so Circle posts opened from Feed return naturally to Feed on Back.
- Circle-name taps explicitly switch to the Circles tab and open `CircleProfile` there.
- Personal-post navigation continues to bubble to the existing root `PostDetail`, `EditPost`, and `Profile` routes.

## Files
- `App.js`
- `src/screens/feed/FeedScreen.js`

## Backend/native
No migration, Edge Function deployment, native rebuild, or EAS build is required.
