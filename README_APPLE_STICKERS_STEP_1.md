# Circles Apple Stickers — Step 1

This replacement patch advances the previously verified native-module baseline into the first real Apple expressive-image import flow.

## What changed

- `CirclesExpressiveInput` now opens a native UIKit sheet backed by `UITextView`.
- On iOS 18+, the text view enables `supportsAdaptiveImageGlyph`.
- When Apple's keyboard inserts a Sticker, Memoji, or Genmoji as `NSAdaptiveImageGlyph`, Circles detects it from the attributed string.
- The glyph is rendered to a temporary 512px PNG and returned to React Native.
- The decoration editor adds **Apple** beside **Photos** inside **Yours**.
- Imported Apple stickers enter the same private image-asset library as custom sticker uploads and are placed as `kind: 'apple_glyph'`.
- Existing `apple_glyph` database validation from Migration 076 is used; **no new SQL migration is required**.
- A deterministic asset id derived from Apple's stable `contentIdentifier` prevents repeatedly importing the same Apple sticker from consuming duplicate library slots.
- Apple imports participate in existing undo, delete, layer, resize, rotate, save, signed-URL, and cleanup behavior.
- Apple stickers are persisted as PNG assets, so they remain renderable on Android/web/non-Apple viewers even though importing is iOS-only.

## What can be verified before joining the Apple Developer Program

After copying the replacement files over the current working project:

```bash
npx eas-cli@latest build --platform ios --profile development-simulator
```

A successful build verifies the new Swift/UIKit implementation compiles and autolinks in EAS. The resulting simulator build still cannot install on a physical iPhone.

You can also continue using the normal app build to make sure Emoji, Text, Photos, canvas editing, undo/redo, and decoration saving have not regressed. The **Apple** button only becomes functional when the custom iOS native module is present.

## Physical-device test later

Once the Apple Developer Program/device signing is available, use a physical-device development build and test:

1. Open personal profile Customize → Decorations → Yours → Apple.
2. Confirm the native Apple Stickers sheet appears and the keyboard opens automatically.
3. Open the emoji/sticker keyboard and choose an Apple Sticker, Memoji, or Genmoji.
4. Confirm the sheet closes and the sticker appears immediately on the live canvas.
5. Resize, rotate, move, layer, undo/redo, then Save.
6. Reopen the editor and confirm the imported item remains in Yours and renders correctly.
7. Add a second copy from Yours without re-importing it.
8. Import the same Apple sticker again and confirm Circles reuses the library asset rather than adding a duplicate asset.
9. Repeat on a regular Circle and Our Circle customization surface.
10. View the decorated profile/Circle from another account to confirm signed asset delivery works.

## Local checks already completed for this patch

- Swift parser: pass
- Native module TypeScript: pass
- Expo module autolinking discovery: pass
- Full iOS Metro/Hermes export: pass

The project-wide TypeScript command still reports the existing Deno/Supabase Edge Function environment type errors; this patch does not add any new TypeScript errors.
