# Circles Step 29 — no-photo event memory title fix

This fixes the root layout bug that hid the Timeline hero overlay for event memories with no preview photos.

## Cause

`EventAlbumMemoryCover` used absolute positioning for the artwork when photo peeks existed, but left the no-photo Event Look in normal layout flow. The Event Look consumed the cover's full fixed height, so the title/date/SHARED MEMORY overlay rendered below it and was clipped by `overflow: hidden`.

## Fix

The no-photo Event Look is now also positioned as the cover background. The overlay remains in the visible layer above it, matching the photo-peek path.

## Expected result

Past events with 0 photos now show the same hero metadata as events with photos:
- SHARED MEMORY pill
- event date
- event title
- location when present

No migration, backend deployment, native rebuild, or EAS build is required.
