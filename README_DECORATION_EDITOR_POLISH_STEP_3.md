# Circles Decoration Editor — Polish Step 3

Baseline: Apple Stickers Step 2 hardening applied and EAS simulator build confirmed successful.

This patch is JavaScript/editor-only. It does not change the native Apple module or database schema.

## Changes

- Protects unsaved decoration changes from back buttons and navigation gestures.
- Clean editor exits now say `Done`; changed editor state says `Save`.
- Live header correctly says `LIVE PROFILE` or `LIVE CIRCLE`.
- Unsaved state is surfaced quietly in the live pill.
- Apple temporary PNGs are cleaned after save or discard.
- Apple temporary PNGs are also cleaned if an import is undone back to the original state and the editor exits cleanly.
- Existing text decorations can be edited in place (content, style, color).
- Existing emoji decorations can be edited in place.
- Any selected decoration can be duplicated without duplicating its underlying image-library asset.
- Size controls no longer create useless undo entries when already at the min/max scale.
- Added accessibility labels to core editor/history/action controls.
- Collapsed control button now says `Decorate` rather than `Stickers` because the editor supports text, emoji, photos, and Apple assets.

## Suggested manual test

1. Open personal profile decorations.
2. Add an emoji; verify top-right changes from `Done` to `Save` and live pill says `unsaved changes`.
3. Tap back; verify `Discard decoration changes?` appears. Choose `Keep editing`.
4. Select the emoji → `Edit`; change it and tap `Update`.
5. Select it → `Duplicate`; verify a second copy appears offset nearby.
6. Undo/redo the edit and duplicate.
7. Add a text decoration; select it → `Edit`; change wording, Glass/Ink/Soft style, and color, then `Update`.
8. Save, reopen, and confirm content/positions remain.
9. Repeat the same workflow in a regular Circle / Our Circle decoration editor.
10. Verify an untouched editor shows `Done` and exits without an unnecessary save call.

Apple-specific runtime interaction still waits for a signed physical-device build, but the native Step 2 implementation has already passed EAS simulator compilation.
