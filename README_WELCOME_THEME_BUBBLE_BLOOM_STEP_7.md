# Circles — Welcome Theme Bubble Bloom Step 7

Replace the included files at their matching project paths.

## What changed

- Removed the old blue-filled launch-circle surface and replaced it with a neutral translucent glass surface.
- Kept the fluid particle field as the color-carrying detail inside the center Circle.
- Removed the single expanding blue portal wash.
- Added a seven-circle entrance bloom using translucent discs, glass bubbles, and thick rings inspired by the Circles-tab `ThemeAtmosphere` decals.
- The entrance bloom uses the active theme's `circle.decalPalette`, so each saved theme gets its own transition palette.
- The portal background/floating atmosphere now consumes the active theme's welcome tokens instead of a fixed hard-coded brand palette.
- Theme hydration still completes before the launch portal becomes interactive, preventing a Default-theme flash.
- Reduce Motion keeps the existing simple fade and skips the bubble bloom.

## Suggested test

1. Relaunch into the Welcome back portal.
2. Confirm the large center Circle is clear/glassy rather than blue-filled.
3. Confirm the particles inside it still carry the theme color.
4. Tap the Circle.
5. Confirm several circles/rings bloom outward instead of one blue screen wash.
6. Change the global theme and preview/relaunch again.
7. Confirm the bubble bloom changes with the selected theme.
8. Pay attention to whether the bloom is too slow, too busy, or too opaque; those are now simple motion/style tuning rather than architectural changes.

## Validation completed

- `node --check` for the changed JS files.
- iOS Expo/Metro/Hermes production export succeeded with 2,111 modules.
- Scoped whitespace check passed for the four replacement files.
- No native changes; no EAS rebuild is required.
