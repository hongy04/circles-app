# Step 9C.4 — Circle Comment Composer Safe-Area Fix

This patch fixes the Circle comments composer being cropped against the bottom edge of phones with a home indicator or navigation bar.

## What changed

- The comments sheet now measures the actual device bottom safe area directly.
- It falls back to the app's initial window metrics when modal safe-area reporting returns zero.
- The composer receives explicit bottom padding instead of relying on a nested `SafeAreaView` inside an animated, clipped sheet.
- While the keyboard is open, the extra home-indicator padding is reduced so the composer stays close to the keyboard rather than floating too high.
- Android translucent navigation-bar handling is included.
- The same shared comments sheet remains in use for personal and Circle posts, so their interaction stays consistent.

## Apply

Copy the package contents into:

```text
C:\Users\honge\Dev\circles-app
```

Allow Windows to replace the included files.

No Supabase migration is required.

Restart Expo:

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Test

1. Open a Circle post from the scrolling feed.
2. Tap `View all comments`.
3. Confirm the complete rounded comment field is visible above the home indicator.
4. Open the keyboard and confirm the composer moves directly above it.
5. Close the keyboard and confirm the bottom padding returns.
6. Repeat on a personal post to confirm the shared comments design remains unchanged.
