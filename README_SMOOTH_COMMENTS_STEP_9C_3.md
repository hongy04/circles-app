# Circles Step 9C.3 — Smooth Scrollable Comments

This checkpoint cleans up comments in the new vertically scrolling account and Circle-post feeds.

## Included files

- `App.js` — complete current application entry file.
- `src/components/comments/InstagramComments.js` — the existing shared Instagram-style comment row and composer.
- `src/components/comments/InstagramCommentsSheet.js` — new shared animated comments sheet.
- `src/screens/profile/ProfilePostsFeedScreen.js` — personal-profile post feed comments now open in the sheet.
- `src/screens/conversations/CirclePostsFeedScreen.js` — Circle-post feed comments now open in the same sheet.
- `smooth-comments-step9c3.patch` — exact changes from Step 9C.2.

No Supabase migration is required.

## What changed

### The comment link is no longer clipped

The personal and Circle post cards now reserve enough vertical space for:

- likes or private comment count,
- caption,
- and the complete `View all comments` / `Add a comment` line.

The link also has its own bottom padding and touch target.

### Comments no longer navigate away from the scrolling feed

Tapping either the comment icon or the comment link now slides up an Instagram-style comments sheet over the current post.

The post feed remains exactly where it was behind the sheet. Closing comments returns to the same post and scroll position.

### Comments become their own scrollable surface

Inside the sheet:

- comments scroll independently,
- the header and close button remain visible,
- the composer stays pinned to the bottom,
- the composer rises above the iPhone keyboard,
- tapping outside the sheet closes it,
- and the transition slides smoothly up and down.

### Personal and Circle comments stay consistent

Both use the same visual component and interaction pattern.

Personal comments support loading and adding comments. Circle comments additionally preserve the existing long-press deletion rule for a member's own comment and remain labeled private.

## Apply the files

1. Extract `circles-smooth-comments-step9c3.zip`.
2. Copy the contents of `circles_smooth_comments_step9c3_package` into:

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

### Personal profile posts

1. Open your profile or another account's profile.
2. Tap a middle post and scroll to another post.
3. Confirm the complete `View all comments` line is visible.
4. Tap the comment bubble or comment line.
5. Confirm comments slide up without navigating away.
6. Scroll the comments and post a new comment.
7. Open and dismiss the keyboard.
8. Close the sheet and confirm the profile feed remains on the same post.

### Circle posts

1. Open a Circle profile and tap a post tile.
2. Confirm the comment line is fully visible.
3. Open the comments sheet and add a private comment.
4. Long-press your own Circle comment and confirm deletion still works.
5. Close the sheet and confirm the Circle-post feed has not moved.

## Commit after testing

```powershell
git status
git add App.js src README_SMOOTH_COMMENTS_STEP_9C_3.md
git commit -m "Add smooth scrollable comments sheets"
git push
```

## Validation performed

The complete `App.js` and all four included comment/feed JavaScript files passed TypeScript JSX syntax transformation. Live animation, keyboard placement, comment loading, and multi-account Circle updates still require testing on the connected Expo device.
