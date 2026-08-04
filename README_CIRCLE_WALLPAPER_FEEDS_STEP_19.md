# Circles Step 19 — Circle wallpaper in Posts + Timeline

Apply this patch on top of the confirmed Step 18 baseline.

## What changed

- Circle Posts and Circle Timeline now use the Circle's saved shared background image or background color as a fixed wallpaper behind their floating cards.
- The wallpaper reuses the warm Circle-decoration navigation cache during normal Circle Profile -> Posts/Timeline navigation, so it does not add another request to the common path.
- Cold/deep entry quietly resolves the Circle decoration without blocking the post/timeline data.
- Post/timeline cards are slightly translucent so the Circle wallpaper reads through the gaps while text/actions stay readable.
- Post photos/videos themselves remain fully neutral and opaque.
- Loading/empty/error states no longer paint an opaque Circle-profile background over the wallpaper.
- No post, timeline, navigation, realtime, or performance behavior was changed.

## Test

1. Give a regular Circle a custom background photo, then open Posts and Timeline.
2. Confirm the same background remains fixed behind the scrolling cards.
3. Repeat with a background color instead of a photo.
4. Repeat in Our Circle.
5. Try a busy/light and a dark/photo-heavy background and confirm captions/actions remain easy to read.
6. Go Circle Profile -> Posts -> Back -> Timeline -> Back and confirm Step 18 performance remains quick.

No migration, native change, or EAS rebuild is required.
