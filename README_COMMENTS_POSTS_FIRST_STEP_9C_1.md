# Circles Step 9C.1 — Consistent Comments + Posts-First Circle Profiles

This checkpoint standardizes personal-post and Circle-post comments around one shared Instagram-style presentation, fixes the personal-post comment composer being covered by the iPhone keyboard, and makes Posts the main tab on Circle profiles.

## Product behavior

### Personal post detail

- Comments load automatically when the post opens.
- Comments are visible directly beneath the caption instead of requiring a second Comments button or modal.
- The comment icon scrolls to and focuses the composer.
- The entire detail body resizes with the keyboard, so the composer stays visible.
- The composer supports multiple lines and remains pinned beneath the comment list.

### Feed comments sheet

The existing feed comments sheet remains available from feed cards, but now uses the same shared comment row and composer as the two post-detail screens. Its keyboard-avoiding view wraps the full sheet body instead of only the input.

### Circle post detail

- Uses the same avatar, inline bold username, comment body, relative timestamp, empty state, and Post composer as personal posts.
- Existing Circle privacy remains unchanged.
- A member can still long-press their own Circle comment to delete it.

### Circle profile

- Posts opens first by default.
- Posts appears before Timeline in both the statistics and tabs.
- Timeline remains available as the secondary archive of media originally sent through Chat.

## Database

No Supabase migration is required. This checkpoint changes only React Native presentation and navigation defaults.

## Apply on Windows

Extract the package and copy its contents into:

```text
C:\Users\honge\Dev\circles-app
```

Allow Windows to merge folders and replace the included files.

Restart Expo:

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Test checklist

### Personal post comments

1. Open a personal post detail page.
2. Confirm existing comments are already visible beneath the post.
3. Tap the comment bubble and confirm the composer receives focus.
4. Type while the iPhone keyboard is open.
5. Confirm the composer stays completely above the keyboard.
6. Post a comment and confirm it appears in the same Instagram-style row used by Circle posts.
7. Drag the comments downward and confirm interactive keyboard dismissal works.

### Feed comments sheet

1. Open comments directly from a post in Feed.
2. Confirm the rows and composer match the personal and Circle post-detail screens.
3. Type a comment and confirm the keyboard does not cover the composer.

### Circle post comments

1. Open a Circle post.
2. Confirm comments remain visible automatically.
3. Confirm the row layout matches personal posts.
4. Add a comment.
5. Long-press your own Circle comment and confirm deletion still works.

### Circle profile ordering

1. Open a group Circle profile from Chat.
2. Confirm Posts is selected automatically.
3. Confirm the Posts statistic and tab appear before Timeline.
4. Switch to Timeline and confirm chat media is unchanged.
5. Leave and reopen the Circle profile and confirm it returns to Posts.

## Suggested commit

```powershell
git status
git add App.js src README_COMMENTS_POSTS_FIRST_STEP_9C_1.md
git commit -m "Unify comments and prioritize Circle posts"
git push
```

## Validation completed

The complete `App.js` and all five changed/new JavaScript files passed Babel JSX parsing. Physical-device keyboard positioning and live comment submission still require the phone test above.
