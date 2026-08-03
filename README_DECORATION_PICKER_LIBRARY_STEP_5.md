# Circles Decoration Picker + Library Polish — Step 5

Apply this patch on top of the confirmed Step 4 floating-tools patch.

## What changed

- Refined Emoji / Text / Yours tabs with icons and a subtle fade/slide transition.
- Emoji quick picks now distinguish preview-vs-place behavior:
  - New decoration: tap a quick emoji to place it immediately.
  - Editing an existing emoji: tap to preview, then Apply to commit.
- Empty Add/Apply buttons are disabled instead of silently doing nothing.
- Text tools are split into clearer Style and Color rows.
- Selected text color shows a checkmark.
- Yours is now a reusable sticker shelf rather than a mixed upload/tile strip.
- Apple Sticker and Photos imports are separate compact actions with clearer descriptions.
- A full Photos asset shelf visibly disables new photo import; Apple import remains available so duplicate Apple stickers can still reuse an existing asset.
- Saved Apple/photo stickers have cleaner thumbnail cards and source badges.
- If the selected canvas decoration came from the shelf, its source card is highlighted.
- Added an actual empty state explaining that imported stickers can be reused.
- Capacity is now shown as compact status pills instead of one dense line.
- Selected decorations are temporarily lifted above the live-profile preview while editing and use the current Circle/theme accent for the selection outline.

## Suggested test pass

### Emoji
1. Open Decorate > Emoji.
2. Switch between tabs a few times; transition should be quick and subtle.
3. Tap a quick emoji while not editing; it should place immediately.
4. Select that emoji > Edit.
5. Tap a different quick emoji; the existing decoration should preview it without exiting edit mode.
6. Tap Apply; it should commit normally and Undo should restore the previous emoji.

### Text
1. Add a text decoration.
2. Edit it.
3. Change Style and Color; both should continue previewing live.
4. Selected color should show a checkmark.
5. Apply / Cancel / Undo / Redo should behave as before.

### Yours
1. Open Yours with no saved images if possible; verify the empty-state explanation.
2. Import from Photos and confirm it is immediately placed and saved to the shelf after Save.
3. Reopen the editor and tap the saved thumbnail; another copy should be placed without re-importing.
4. Select a placed custom image; its matching shelf card should highlight.
5. Remove a shelf item and verify the existing usage warning still behaves correctly.
6. On iOS, the Apple Sticker import action should remain visible. The actual iPhone Sticker/Genmoji interaction still waits for the signed physical-device build.

### General
1. Fill the canvas with several decorations and verify the selected item stays visibly outlined over the live preview while editing.
2. Check both a personal profile and a Circle / Our Circle editor.
3. Save, reopen, and verify persistence.

## Validation completed here

- Expo iOS Metro/Hermes export: PASS (2111 modules)
- `git diff --check`: PASS
- No native module changes in this patch; another EAS native build is not required for Step 5.
