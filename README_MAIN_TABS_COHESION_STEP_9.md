# Circles — Main Tabs Cohesion Step 9

This patch brings the Feed and Mutuals tabs into the newer theme-aware Frutiger Aero / glass visual system without changing their data, navigation, ranking, or privacy behavior.

## Changed files
- `App.js`
- `src/screens/feed/FeedScreen.js`

## Feed
- Adds the active theme's ambient circle/decal atmosphere behind the tab.
- Adds a light glass intro surface around the Feed title, create-post action, and Stories rail.
- Keeps actual posts/media neutral and readable; the atmosphere is intentionally strongest in the surrounding space rather than over content.
- Theme-aware pull-to-refresh tint.
- Loading/error states now retain the selected theme rather than flashing flat white.
- Error notices use lighter glass surfaces.

## Mutuals / Requests
- Adds the same active-theme atmosphere used by the Circles tab family.
- Refines the title/invite area into a light glass header.
- Refines the Mutuals / Requests switcher into a compact floating segmented surface.
- Candidate, ranking-context, request, and empty-state cards use subtle glass/translucent surfaces with theme-accent borders.
- The selected theme still controls all primary actions.
- No changes to trusted ranking, preview privacy, request logic, or realtime refresh behavior.

## Suggested test
1. Switch through several themes in Appearance, especially Aqua Daylight, Citrus Garden, Bubblegum Sky, Sunset Coral, and Midnight Harbor.
2. Open Feed and confirm the atmosphere is visible but posts/photos still feel neutral.
3. Scroll Feed, pull to refresh, open Stories, return, and create/open a post to check for regressions.
4. Open Mutuals and compare the header, segmented control, context notice, and candidate cards across themes.
5. Switch to Requests and test both an empty list and any available request card.
6. Confirm tapping profiles, Request, Accept, Decline, and Invite works exactly as before.

## Validation performed
- `node --check App.js`
- `node --check src/screens/feed/FeedScreen.js`
- scoped `git diff --check`
- iOS Expo/Metro/Hermes production export: 2,111 modules

No native changes; no EAS rebuild is required.
