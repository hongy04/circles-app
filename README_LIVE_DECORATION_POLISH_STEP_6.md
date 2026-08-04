# Circles Live Decoration Polish — Step 6

Apply this on top of the confirmed Step 5 picker/library baseline.

## Goal

Bring the finished personal profile, regular Circle, and Our Circle closer to the quality of the decoration editor itself. The previous live surfaces still used several older opaque/flat panels that hid more of a person's background and decals than necessary.

## What changed

### Personal profiles
- Decorated profile headers now use a softer translucent glass gradient instead of a flat ~88% white block.
- A subtle glass edge keeps text readable without making the header feel boxed in.
- When a decorated profile has no header image, the normal top bar now becomes translucent glass instead of reverting to a flat app-background strip.
- Reduced the full-width content veil from 24% white to 10%, so backgrounds and decorations remain visible between real content.
- Empty-post states remain readable but are less opaque.

### Regular Circle / Our Circle
- The decorated shared header is less opaque while retaining the Circle accent tint.
- People strip gains a light glass surface only when decoration is active.
- Posts / Timeline tabs gain a matching glass rail only when decoration is active.
- The floating back button has a cleaner glass edge and subtle elevation.
- Non-decorated Circle profiles are unchanged.

## Suggested test pass

### Personal profile
1. Test a profile with background color + several decorations, no header image.
2. Confirm the top bar now feels integrated with the decorated profile instead of becoming an opaque strip.
3. Confirm profile name, bio, stats, and buttons remain easy to read.
4. Scroll through the circular post grid and verify more of the background/decorations can breathe through the spaces around content.
5. Test again with a custom background image and with a custom header image.
6. Test an empty-post profile and confirm the empty state is still readable.

### Regular Circle
1. Open a decorated Circle with a background and decals.
2. Confirm the header, People strip, and Posts/Timeline rail read as related glass surfaces rather than separate opaque blocks.
3. Verify People, See all, tabs, and action buttons remain tappable and legible.
4. Test with and without a custom Circle header image.

### Our Circle
1. Repeat a quick pass in a decorated Our Circle.
2. Verify shared bio/quiet message, stats, actions, and tabs remain readable.
3. Confirm the decoration treatment feels consistent with regular Circles without making the two-person space generic.

### Regression
1. Open an undecorated personal profile and undecorated Circle.
2. Their existing normal theme surfaces should look unchanged.

## Validation completed here
- Expo iOS Metro/Hermes export: PASS (2111 modules)
- `git diff --check`: PASS
- No native changes; no EAS rebuild is required for this step.
