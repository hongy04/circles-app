# Circles Step 28 — Living Scrapbook Scroll

Apply this patch on top of the confirmed Step 27 state.

## What changes

### Past event memories
- Past/after-gathering cards are now full visual scrapbook cards rather than an artwork strip followed by a text panel.
- The event custom cover / preset Event Look remains the identity anchor.
- Up to three real Event Photos automatically peek into the card.
- The list read model returns those preview paths in the same request as the event summaries; the app signs cover + preview media in one batch.
- Past cards use a few restrained base heights so the history feels collected rather than mechanically identical.
- As a memory passes through the reading area, it gently lifts, opens, and comes forward. Upcoming events stay static and functional.

### Our Circle Shared Albums
- The Step 26 scrapbook cards now use the same lift-on-scroll language.
- Existing selected covers / automatic collages are unchanged.
- Their pre-existing scrapbook size variation combines with the subtle focus lift.

### Motion + performance
- Motion runs through Reanimated on the UI thread; scroll frames do not set React state.
- Only mounted/visible VirtualizedList rows participate.
- Reduce Motion disables the transform automatically.
- No new per-event gallery requests are introduced.

## Backend

Apply Migration 083:

```bash
npx supabase db push
```

The frontend remains backward-compatible before Migration 083; event cards simply omit photo peeks until the migration is applied.

## Test checklist

1. Fully relaunch after applying Migration 083.
2. Open Circle -> Plans & Events with several past events.
3. Confirm upcoming events remain calm/static.
4. Slowly scroll through Past events:
   - each memory should gently rise/enlarge as it crosses the focus area;
   - cards above/below should soften/recede slightly;
   - the effect should feel continuous rather than snap like a carousel.
5. Confirm past events with Event Photos show 1-3 photo peeks beside the event cover/look.
6. Confirm events with no photos still fall back cleanly to the custom cover or preset Event Look.
7. Open Our Circle -> Shared Albums and scroll through several albums.
8. Confirm the same rise/focus behavior works with album cover/collage cards.
9. Tap cards while they are moving and confirm navigation is normal.
10. If Reduce Motion is enabled on the device, confirm cards remain static.

No native changes or EAS rebuild are required.
