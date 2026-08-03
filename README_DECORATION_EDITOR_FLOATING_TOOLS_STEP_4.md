# Circles Decoration Editor — Step 4: Floating Tools + Live Editing

Apply this patch **after Step 3** by replacing the included file at the same path.

## What changed

- Rebuilt the bottom decoration sheet as a draggable floating tool panel.
- Drag the panel vertically from its header/handle to uncover the decoration you are working on.
- Entering text/emoji edit mode no longer automatically focuses the keyboard, so the panel does not immediately jump upward just because you tapped Edit.
- If the selected decoration is underneath the panel when Edit starts, the panel moves to the opposite side of the screen to reveal it.
- When the keyboard is intentionally opened, the panel only moves as much as needed to stay above it and does not bounce back to the bottom when the keyboard closes.
- On iOS, keyboard avoidance begins with `keyboardWillShow` for smoother synchronized motion.
- Text color/style/content and emoji content now preview live on the actual selected decoration before you press Apply.
- Cancel exits live edit without changing the saved decoration.
- Color/style/emoji palette taps work on the first tap even when the keyboard is open (`keyboardShouldPersistTaps="always"`).
- The tool UI is cleaner: compact draggable header, small clear/collapse actions, segmented Emoji/Text/Yours switcher, live-edit indicator, and larger color swatches.
- Existing Step 3 save/discard, undo/redo, duplicate, Apple sticker, and asset behavior is preserved.

## Recommended test

1. Select an existing text decoration near the bottom of the profile and tap **Edit**.
   - The keyboard should **not** open automatically.
   - If the panel was covering the text, it should move away and reveal it.
2. Tap several text colors and styles.
   - Each should apply visually to the decoration **immediately** on the canvas.
   - The first tap should register.
3. Tap inside the text field to intentionally open the keyboard.
   - The tool panel should smoothly stay above the keyboard.
   - Tap a color while the keyboard remains open; it should register immediately.
4. Dismiss the keyboard.
   - The panel should stay where it was instead of jumping back to the bottom.
5. Drag the panel up and down using the grabber/header.
   - It should follow smoothly and remain inside safe screen bounds.
6. Tap **Cancel** during an edit.
   - The original text/style/color should be restored because live changes were only a preview.
7. Edit again and tap **Apply**.
   - The change should become a normal undoable editor change.
8. Repeat with an emoji decoration.
9. Save, reopen, and confirm persistence.
10. Repeat a quick pass in a regular Circle / Our Circle.

## Validation already run

- `git diff --check` passes.
- Full iOS Expo Metro + Hermes production export passes (2,111 modules).
- No native Apple-module files changed, so another EAS native rebuild is not required for this patch.
