# Circles Apple Stickers — Step 2 runtime hardening

This patch builds on the successful Step 1 EAS iOS simulator compile.

## Changes

- Bumps the native expressive-input bridge to `apple-glyph-2`.
- Adds best-effort native cleanup for temporary Apple PNGs that Circles does not keep.
- Cleanup is sandboxed to the module's own cache directory.
- Duplicate Apple stickers can be reused even when the 24-image library is full.
- Duplicate imports no longer create a duplicate library asset.
- Duplicate/no-op imports no longer create misleading undo history.
- Apple asset IDs remain deterministic but no longer embed a readable portion of Apple's content identifier.
- Apple-origin detection is centralized and remains backward-compatible with `apple-` IDs.
- The native input surface has clearer accessibility labels/hints.
- Regular text/Unicode emoji entered into the Apple picker is rejected and cleared so the user can immediately try again.

## Validation already run

- `node --check` on the changed JavaScript files: PASS
- targeted TypeScript compile for the local native module: PASS
- Swift syntax parse: PASS
- full Expo iOS Metro/Hermes export: PASS
- whitespace check on the patch files: PASS

## Next compile checkpoint

Run:

```bash
npx eas-cli@latest build --platform ios --profile development-simulator
```

A successful build validates the new native cleanup method in Apple's toolchain. Do not try to install the simulator build on a physical iPhone.

## Later physical-iPhone test

Once a signed physical-device development build is available:

1. Open personal profile Customize -> Decorations -> Yours -> Apple.
2. Choose a Sticker, Memoji, or Genmoji from Apple's emoji/sticker keyboard.
3. Confirm it lands immediately on the canvas.
4. Move, scale, rotate, reorder, undo/redo, save, close, and reopen.
5. Reimport the same Apple sticker and confirm Circles reuses the library asset.
6. Repeat on a regular Circle and Our Circle.
7. View the saved profile/Circle from another account.
