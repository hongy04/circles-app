# Circles — Navigation Preservation Step 13

## Why this patch exists
Step 12 optimized remounts and preloading, but the user correctly identified that the real UX target is preserving the screen that is already open. Returning from a child page should reveal the exact parent page immediately, not show a loader and rebuild its header/background/posts.

## Root cause fixed
`CircleThemeBoundary` used to set `loading=true` whenever a Circle route regained focus, then replace its children with a full-screen loading state. That unmounted the actual Circle screen. Returning Circle Profile <- Plans therefore destroyed and recreated the profile UI even though React Navigation had preserved the route.

## Changes
- Circle theme refreshes never replace/remove the child screen.
- Last resolved Circle theme metadata is reused in-memory across child routes, so Profile -> Plans -> Event no longer pays a separate theme-loading gate for each screen.
- Theme permissions/settings still revalidate quietly on focus.
- Removed Step 12's `lazy: false` main-tab preloading. Tabs mount normally again instead of Feed/Mutuals/Me/Circles all competing for work at launch.
- Circle Profile keeps its existing screen state visible on return and skips redundant full data revalidation after short (<20s) child-page visits.
- Personal Profile gets the same short-return behavior.
- When a quiet refresh returns the same decoration storage paths, existing signed header/background/custom-sticker URLs are retained. This prevents React Native from treating an unchanged image as a new source and flashing/reloading it.
- The Step 12 in-memory navigation cache remains available for genuinely remounted destination screens; this patch changes the priority to preservation first, cache second.

## Primary test
1. Open a decorated regular Circle profile.
2. Note its header/background/posts and scroll position.
3. Open Plans & Events.
4. Immediately go Back.
5. The Circle profile should already be there. It should NOT show a Circle/theme loading screen, blank itself, or visibly rebuild the header/background/posts.
6. Repeat with People, More, Posts, and Timeline.
7. Repeat in Our Circle with Shared Plans / Dates / Albums.
8. Open Me/profile -> a post feed/detail -> Back. The profile decoration should not visibly reload just because focus returned.
9. Switch main tabs. Initial tab behavior may now be lazy again, but once a tab has mounted its state should remain stable.

## Expected tradeoff
This patch intentionally stops trying to preload every major tab. A tab that has literally never been opened can still perform its first real load. The goal is that normal back-and-forth navigation does not repeatedly blank or reconstruct screens you have already been using.

## Validation
- JS syntax checks: passed.
- `git diff --check` for Step 13 files: passed.
- Expo iOS Metro/Hermes production export: 2,112 modules, successful.
- No native-code changes; no EAS rebuild required.
