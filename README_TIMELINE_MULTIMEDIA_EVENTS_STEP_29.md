# Circles Step 29 — Timeline Multimedia Event Memories

Apply this patch on top of the confirmed Step 28 baseline.

## What changed

### Circle Profile → Timeline event tiles
- Tapping an event memory tile no longer bypasses Timeline and opens Event Detail.
- It now opens `CircleTimelineFeed` positioned on that event via `initialEventId`.
- The small profile Timeline event tile also uses the same scrapbook cover + photo-peek language as past-event memories.

### Full Circle Timeline
Completed-event memories are now real multimedia Timeline entries:

1. **First horizontal page:** scrapbook event memory summary
   - custom event cover or Event Look
   - up to three photo peeks
   - event title, date, and location
2. **Next horizontal pages:** real event photos, swipable directly in Timeline
3. Up to **6 inline photos** are loaded per event memory to keep the long Timeline bounded and fast.
4. If an event has more photos, the last inline image says how many more are in the album.
5. **All photos** opens the full Event Photos gallery.
6. **Event details** is now the secondary path for logistics/history rather than the default action.

### Gallery continuity
Adding/removing event photos updates the warm Event/Timeline caches immediately, including:
- photo count
- three-photo scrapbook preview
- up to six Timeline photo pages

So Back navigation can show the changed memory without waiting for a fresh database round trip.

## Performance design
- Plans & Events still signs only the existing three-photo scrapbook preview.
- Circle Profile also stays on the lighter three-photo preview path.
- Only the full Circle Timeline requests/signs the bounded six-photo multimedia set.
- The existing private `event-media` signed-URL cache is reused.
- No unbounded event gallery is loaded into the scrolling Timeline.

## Migration 084
Apply:

```bash
npx supabase db push
```

Migration:

`supabase/migrations/20260805_084_timeline_event_multimedia.sql`

It extends `list_circle_events` with `timeline_storage_paths`, containing at most six ready event-photo paths. The existing three-photo `preview_storage_paths` contract remains intact.

The frontend retains a pre-migration fallback: without Migration 084 it can still use the existing three scrapbook preview photos inline.

## Test checklist
1. Open a Circle with at least one completed event containing several photos.
2. On Circle Profile, switch to **Timeline**.
3. Tap the event tile.
   - Expected: full scrollable Circle Timeline opens positioned on that event.
   - It should **not** jump directly to Event Detail.
4. On the event Timeline entry:
   - first page = event scrapbook/context
   - swipe left = event photos inline
   - page dots/label update
5. Tap an inline photo → full Event Photos gallery opens.
6. Tap **All photos** → gallery opens.
7. Tap **Event details** → Event Detail opens.
8. For an event with >6 photos, confirm the sixth inline page shows the remaining-photo count.
9. Add a photo in Event Photos, go Back, and confirm the Timeline memory updates without a manual refresh.
10. Delete a photo and repeat.
11. Scroll through a long Timeline and confirm the inline carousels remain smooth.

## Validation
- iOS Expo/Hermes production export passed with 2,122 modules.
- No native changes.
- No EAS rebuild required.
