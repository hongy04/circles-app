# Circles — Step 25: Cozy Plans & Events Room

Apply this patch on top of the confirmed Step 24 state.

## What changed

- The parent Circle **Plans & Events** page now intentionally uses the Circle's saved background image/color as its primary room background.
- The competing theme-atmosphere decal layer was removed from this page so custom Circle wallpaper is actually visible.
- A very light neutral softener protects readability without washing out the wallpaper.
- Create Event / Poll Dates controls remain in a stronger floating glass island.
- Availability polls, upcoming events, memory cards, loading/empty/error states remain readable floating surfaces.
- Section headers now have quiet translucent rails so labels/counts stay legible over detailed photos.
- Cards are slightly more translucent and get subtle depth so the Circle background can breathe through the gaps.
- Individual event pages still use their own Event Look/custom cover. This patch changes only the parent planning room.

## Intentionally unchanged

- Create Event editor
- Poll Dates editor/detail visual identity
- Event lifecycle, RSVP, attendance, memories, guest behavior
- Event/custom-cover logic
- Navigation/performance/cache behavior
- Supabase schema/functions

## Test

1. Open a Circle with a custom background photo.
2. Open **Plans & Events**.
3. Confirm the Circle photo is clearly visible in the gaps and around cards, rather than being hidden by theme decals.
4. Confirm Poll Dates / Create Event remain easy to read and tap.
5. Scroll through availability polls, upcoming events, and past-event memory cards.
6. Open an event and confirm the event still switches to its own Event Look/custom cover identity.
7. Repeat with a Circle using only a custom background color.
8. Repeat with a Circle with no custom background; it should fall back cleanly to the Circle theme background.

## Validation

- `node --check src/screens/conversations/CircleEventsScreen.js` ✅
- `git diff --check` for the changed screen ✅
- iOS Expo/Hermes production export: **2,119 modules** ✅
- No migration / Edge Function / native changes.
