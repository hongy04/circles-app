# Step 29 Event Title Hotfix

Apply this patch on top of Step 29.

## Fix
- Timeline event memories recover their title from the warm event-summary or Circle-events cache when the multimedia memory row is partial.
- The event title now remains visible below the carousel on every page, including while swiping through event photos.
- Event Detail and All Photos navigation use the same resolved title.

## Test
1. Open Circle Profile -> Timeline.
2. Check the newest event memories that previously had no visible title.
3. Swipe from the summary page onto several photos.
4. Confirm the event title remains visible below the carousel.
5. Open All photos and Event details and confirm the destination title is correct.

No migration, Edge Function, native, or EAS change is required.
