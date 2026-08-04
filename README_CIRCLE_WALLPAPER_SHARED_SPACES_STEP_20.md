# Circles — Step 20: Circle Wallpaper Across Shared Spaces

Apply this patch on top of the confirmed Step 19 baseline.

## Goal

Extend a Circle / Our Circle's saved background photo or background color beyond Posts and Timeline so the surrounding shared spaces feel like rooms inside the same Circle rather than unrelated utility pages.

## Updated surfaces

- Circle People
- Circle Plans & Events
- Our Circle Shared Plans
- Our Circle Important Dates
- Our Circle Write Your Thoughts
- Our Circle Shared Albums
- Our Circle Plan Detail
- Our Circle Shared Thought Detail
- Our Circle Album Detail
- Our Circle Plan-to-Memory linking

## Visual rules

- The existing CircleBackdrop is fixed behind the screen and reuses the warm decoration cache from Circle Profile whenever available.
- Theme atmosphere remains subtle on planning/list surfaces so custom wallpaper is not buried.
- Functional cards and controls sit on translucent glass surfaces for readability.
- Actual album/photo media remains opaque.
- Full-screen photo viewing remains black/neutral rather than wallpaper-backed.
- No event, plan, member, date, thought, album, or memory behavior is changed.

## Suggested checks

1. Open a Circle with a custom background photo -> People -> Back -> Plans & Events.
2. Confirm the same wallpaper stays visually consistent and cards remain easy to read.
3. Test a Circle with a solid custom background color.
4. Open Our Circle -> Shared Plans / Important Dates / Write Your Thoughts / Shared Albums.
5. Open a plan detail, a shared thought, an album, and Build Memory.
6. Confirm album photos remain fully opaque and the full-screen photo viewer remains black.
7. Quickly navigate back and forth and confirm the wallpaper does not introduce a new loading pause.

## Validation

- JS syntax checks: passed
- Expo iOS/Hermes production export: passed (2,116 modules)
- Scoped whitespace check: passed
- No database migration
- No native changes / EAS rebuild required
