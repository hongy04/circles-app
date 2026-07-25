# Circles Step 9B.2 — Safe-Area Chat Header Fix

This fixes the chat identity banner being clipped at both the top and bottom.

## Cause

The profile image and name were rendered as a vertically stacked custom title
inside React Navigation's native stack header. On iOS, that native title area
keeps a compact navigation-bar content height. Setting a taller `headerStyle`
did not reliably enlarge the actual title container, so the avatar/name could
be clipped.

## Fix

- The Chat screen now hides the native stack header.
- Chat renders its own safe-area-aware top bar inside the screen.
- The top bar reserves a full 64-point content row below the device status area.
- The back button, centered Circle identity, and right-side spacer keep the
  profile perfectly centered.
- The identity component has an explicit minimum height and text line height.
- Keyboard offset is recalculated for the custom in-screen header.
- The Step 9B.1 unique Realtime channel fix remains included.

No Supabase migration is required.

## Apply

Copy this package into:

`C:\Users\honge\Dev\circles-app`

Allow Windows to merge and replace files, then restart Expo:

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Test

1. Open a direct chat and a group chat.
2. Confirm the avatar and name are fully visible with space above and below.
3. Confirm the back button works.
4. Tap the centered identity and confirm the Circle profile opens.
5. Return repeatedly and confirm no Realtime subscription error appears.
6. Open the keyboard and verify the composer remains above it.
7. Rotate or test on a smaller device if available.
