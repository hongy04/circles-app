# Circles — Step 24: Event Memory & History Polish

Apply this patch on top of the confirmed Step 23 custom-event-cover state.

## Product behavior

### Plans & Events
- Upcoming events keep the straightforward planning-card treatment.
- Past gatherings become warmer memory/postcard cards.
- A settled gathering is labeled **MEMORY**.
- A gathering that ended but has not reached/settled the automatic attendance checkpoint is labeled **AFTER GATHERING**.
- Past cards can show the custom event cover (or preset Event Look), remembered people count, and shared photo count.
- Parent Plans & Events remains Circle-theme-led rather than becoming a wallpaper-heavy surface.

### Past Event Detail
- The past-event recap is now memory-first instead of planning-first.
- Shows a **SHARED MEMORY** recap with people/photo/private summary.
- Host attendance correction remains available, but is deliberately a subtle correction link rather than unfinished homework.
- Past outside-guest content focuses on guests who were actually there.
- Photo count is included in the memory recap and the Photos action.
- Existing **Plan another** / repeat-event loop remains available.

### Circle Profile → Timeline
- Finalized event memories now appear chronologically alongside shared chat-media memories.
- Event memory tiles use the event's custom cover or Event Look.
- Tiles show attendance and photo counts and open the Event Detail memory.
- A gathering enters the actual Circle Timeline only once attendance has settled/finalized, matching the Step 21 lifecycle rather than declaring an immediate memory the moment an event ends.

### Full Circle Timeline feed
- Finalized event memories are interleaved chronologically with shared chat-media groups.
- Memory cards carry the event visual identity, date, people count, photo count, location/description, and an **Open memory** action.
- If chat-media Timeline hydration has a transient error, event memories can still remain usable rather than blanking the whole destination.

### Photo-count continuity
- Adding/deleting an event photo immediately updates the warm Event Detail, Circle event list, and Circle Timeline memory caches so counts do not stay stale after Back navigation.

## Migration 081

This patch adds:

`supabase/migrations/20260805_081_event_memory_history.sql`

Apply it with your normal linked-project workflow, typically:

```bash
npx supabase db push
```

Migration 081:
- enriches `list_circle_events` with attendance source, Event Look/custom-cover metadata, and event photo count;
- lets a normal Plans & Events read quietly finalize any attendance whose Step 21 next-morning threshold is already due;
- adds photo count to the existing event visual-identity read so Event Detail does not need another network request just for its memory recap.

No Edge Function update is required for Step 24.
No native change / EAS rebuild is required.

## Recommended test sequence

1. Apply Migration 081 and fully relaunch Circles.
2. Open **Plans & Events** in a Circle with both upcoming and past events.
   - Upcoming cards should remain planning-oriented.
   - Past gatherings should look like memory/postcard cards.
   - A custom event cover should show on the past card when present.
3. Open a past gathering that has not yet reached its automatic-attendance checkpoint.
   - It may show **AFTER GATHERING** / settling language rather than pretending attendance is final.
4. Open Plans & Events after a gathering's next-morning attendance time has passed.
   - Attendance should settle automatically from Going responses without requiring the host to open Event Detail first.
   - The card should then read as a **MEMORY**.
5. Open a finalized past Event Detail.
   - No RSVP controls.
   - Shared-memory recap shows people + photos + private status.
   - Host correction is present but visually secondary.
6. Open Event Photos, add/delete a photo, and go Back.
   - The event memory photo count should update immediately rather than waiting for a cold reload.
7. Open **Circle Profile → Timeline**.
   - Finalized event memory tile should appear in chronological order with shared media.
   - Tap it and confirm it opens the event memory.
8. Open the full **Circle Timeline** feed from a timeline item.
   - Event memory cards should be interleaved chronologically with chat-media memories.
9. Confirm **Plan another** still works from a past event.

## Validation performed

- iOS Expo/Hermes production export: **2,119 modules**
- Scoped JavaScript syntax/export validation passed
- Scoped whitespace validation passed
