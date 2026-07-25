# Circles Step 9C.2 — Bottom Comment Composer + Profile Scrolling Feeds

This checkpoint fixes the Circle-post comment composer and changes profile-grid navigation so a selected item opens an Instagram-style vertical feed instead of forcing the user back to the grid after every post.

## Included files

- `App.js` — complete application entry file with the new routes registered.
- `src/screens/conversations/CirclePostDetailScreen.js`
- `src/screens/conversations/CircleProfileScreen.js`
- `src/screens/conversations/CirclePostsFeedScreen.js`
- `src/screens/conversations/CircleTimelineFeedScreen.js`
- `src/screens/profile/ProfileViewScreen.js`
- `src/screens/profile/ProfilePostsFeedScreen.js`

No Supabase migration is required.

## Behavior changes

### Circle-post comments

The Circle-post comment composer is now pinned to the actual bottom edge in the same layout pattern as personal-post comments.

- The full comment body resizes with the keyboard.
- The composer no longer receives duplicate safe-area spacing.
- The native navigation header is no longer counted twice in the keyboard offset.
- The comment list remains independently scrollable above the composer.

### Personal profiles

Tapping any tile on your own profile or another person's profile opens a vertically scrolling post feed at the selected post.

- Scroll down to continue through that account's other posts.
- Likes remain interactive.
- The comment icon and comment link open the full personal-post detail page.
- Tapping the author opens the account profile.

### Circle Posts

Tapping a Circle post tile opens a vertically scrolling private Circle-post feed at the selected post.

- Scroll through the remaining Circle posts without returning to the grid.
- Tap media for the full-screen private media viewer.
- Tap comments to open the complete Circle-post comment page.
- Timeline and Posts remain separate.

### Circle Timeline

Tapping a Timeline tile opens a vertically scrolling Timeline feed.

- Media sent together in one chat message is grouped into one Timeline card.
- Each card preserves sender, timestamp, chat caption, and provenance as `From Chat`.
- Tap media to open the existing full-screen viewer.

## Apply the files

1. Extract `circles-profile-scrolling-step9c2.zip`.
2. Copy the contents of `circles_profile_scrolling_step9c2_package` into:

```powershell
C:\Users\honge\Dev\circles-app
```

3. Allow Windows to merge folders and replace the included files.
4. Restart Expo:

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Test checklist

### Circle comment composer

1. Open a Circle post.
2. Confirm the comment composer touches the bottom safe area like the personal-post composer.
3. Focus the field and confirm it rises directly above the keyboard.
4. Add enough comments to make the list scroll and confirm the composer stays fixed.

### Personal profile feed

1. Open **Me** and tap the second or third post tile.
2. Confirm that exact post opens first.
3. Scroll downward through the account's remaining posts.
4. Repeat from Alex Test's profile.
5. Toggle a like and open comments.

### Circle Posts feed

1. Open a Circle profile and keep **Posts** selected.
2. Tap a post in the middle of the grid.
3. Confirm it opens first and the rest of the private posts continue vertically.
4. Open media and comments from the scrolling feed.

### Timeline feed

1. Open the Circle's **Timeline** tab.
2. Tap a media tile.
3. Confirm the corresponding chat-media card opens first.
4. Scroll through the rest of the Timeline.
5. Confirm media sent together appears in one card.

## Commit after testing

```powershell
git status
git add App.js src README_PROFILE_SCROLLING_STEP_9C_2.md
git commit -m "Add scrolling profile feeds and pin Circle comments"
git push
```

## Validation performed

All seven included JavaScript files were parsed successfully as JSX with the TypeScript parser. Live navigation position, keyboard behavior, media viewing, likes, and Realtime refresh still require testing on the connected Expo device.
