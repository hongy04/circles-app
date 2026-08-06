# Circles — Step 32: Timeline Finishing Pass

This patch assumes Steps 30–31 are already applied.

## What changed

- Gives the full Circle Timeline a subtle shared "memory comes into focus" motion using the existing `MemoryLiftSurface` / Reanimated UI-thread path.
- Respects Reduce Motion automatically through the existing lift component.
- Adds quiet chronology rails only when the time period changes:
  - Today
  - Yesterday
  - Earlier This Week
  - This Month
  - Month / Month + Year for older history
- Standardizes multimedia paging across:
  - chat media memories
  - event memories
  - completed plan memories with linked albums
- Chat media now has the same page-dot language as event and album memories.
- Event and linked-album pager labels now retain context and show the current page count.
- Horizontal memory carousels use directional locking, fast deceleration, nested scrolling, and interval-momentum control so vertical Timeline scrolling and horizontal photo swiping feel more intentional.
- Keeps fixed row measurement / `getItemLayout` so navigation-to-memory positioning remains deterministic and fast.

## Files

- `src/screens/conversations/CircleTimelineFeedScreen.js`

## Backend / native work

None.

- No Supabase migration.
- No Edge Function deploy.
- No native module changes.
- No EAS rebuild required.

## Suggested test

1. Open a Timeline that contains several different memory types.
2. Scroll vertically through chat media, events, milestones, thoughts, and plan memories.
3. Confirm only the memory near the reading zone gets a very subtle lift; it should not feel like a carousel.
4. Swipe horizontally through:
   - a multi-image chat memory
   - an event with photos
   - a completed plan with linked-album photos
5. Confirm horizontal swipes do not accidentally pull the Timeline vertically and vice versa.
6. Confirm page dots / page counts update after each horizontal swipe.
7. Open the Timeline from a profile tile using an initial event/plan/date/thought/media id and confirm it still lands on the intended memory.
8. With Reduce Motion enabled, confirm the lift motion is disabled while the layout remains unchanged.

## Validation

- `node --check src/screens/conversations/CircleTimelineFeedScreen.js` — passed.
- iOS Expo/Hermes production export — passed at 2,122 modules.
