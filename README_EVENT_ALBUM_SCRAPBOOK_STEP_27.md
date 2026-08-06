# Circles — Step 27: Event Album Scrapbook

Apply this patch on top of the confirmed Step 26 state.

## What changed

- Event Photos now opens with a scrapbook-style event album cover.
- The event's existing custom cover photo or preset Event Look remains the album's identity; there is no second event-album cover setting.
- Up to three shared event photos automatically appear as collage peeks beside the event identity.
- Adding/removing photos updates the collage automatically.
- The photo grid has more breathing room and rounded memory tiles.
- Full-screen photo viewing remains neutral/black.
- No new database migration, Edge Function, native code, or EAS build is required.

## Suggested test

1. Open an event with a custom event cover and 3+ photos.
2. Open Photos and confirm the cover/look anchors the album while shared-photo peeks appear beside it.
3. Add a new photo and confirm the album cover updates without leaving/reopening.
4. Delete one of the preview photos and confirm the collage reorganizes automatically.
5. Test an event with only a preset Event Look and no custom cover.
6. Test 0, 1, 2, and 3+ event photos.
7. Open a photo full screen and confirm the viewer stays neutral.
