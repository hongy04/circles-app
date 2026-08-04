# Circles — Navigation Continuity / Perceived Performance Step 12

## Goal
Stop ordinary navigation from feeling like a series of cold app launches. If Circles already has useful private data for the destination, render that snapshot immediately and quietly revalidate it in the background.

## Core architecture
- Adds a lightweight, in-memory `navigationCacheService`.
- Cache is **not persisted to disk** and expires after a short session window.
- Cache is scoped to the authenticated user and is cleared on sign-out / dev-account switching so one account can never flash another account's private content.
- The cache is intentionally a continuity layer, not a replacement for Supabase or realtime refreshes.

## Main changes
- Primary bottom tabs mount together so first switches between Circles / Mutuals / Feed / Me can preload behind the app experience.
- Inbox and Notifications retain warm session snapshots and still refresh quietly/realtime.
- Chat remembers a recent message snapshot and conversation identity; reopening the same chat can paint immediately, then revalidate.
- Chat also seeds conversation details so Circle/Direct details do not need to cold-open immediately afterward.
- Circle Profile seeds data it has already fetched into Posts, Timeline, People, Plans, Important Dates, Thoughts, Albums, and individual detail caches.
- Circle More / People / Posts / Timeline reuse those snapshots and quietly refresh on focus.
- Circle Events seeds event and poll summaries; Event and Poll details can show meaningful content immediately while attendee/options/member details hydrate inline.
- Event Photo Gallery now renders its gallery shell immediately and uses inline loading instead of a blank full-screen opening state; repeat opens reuse the gallery snapshot.
- Our Circle plan/date/thought/album lists and detail/editor screens reuse their current objects instead of refetching before first paint.
- Newly created plan/album objects seed their destination before navigation when there is enough safe local information to do so.
- Personal post detail/edit and Circle post detail/edit reuse the post the user was already looking at.
- Profile pages and profile-post feeds retain short-lived snapshots for repeat navigation.
- Full-screen loading remains only for genuinely cold screens where Circles has no trustworthy content yet.

## Important editor behavior
Cached editors do not immediately overwrite the form with a background request after opening. This avoids the race where someone starts typing and a late refresh resets their edits.

## Suggested test pass
1. Launch into Main Tabs, then switch Circles → Mutuals → Feed → Me and back. Judge the first-switch feel.
2. Open a chat from Inbox, back out, reopen the same chat. Existing messages should paint immediately; refresh should be quiet.
3. From Chat open Circle Profile / direct details, then Circle More and People. These should no longer feel like separate cold launches when the source already loaded the data.
4. From a Circle open Posts, Timeline, Plans & Events, an event, and an availability poll. Event/poll shells should appear from summary data while deeper rows hydrate inline.
5. Open Event Photos. On a truly cold first visit the gallery frame stays visible with an inline loader; repeat visits should reuse the last gallery.
6. In Our Circle open Plans, Important Dates, Thoughts, Albums, then open/edit individual items. Existing items should avoid full opening screens when they came from a warm list/profile.
7. Open a personal post and Circle post, then their edit actions. The editor should open from the object already on screen rather than blanking first.
8. Open the same profile, back out, and reopen it. The second open should paint immediately and refresh quietly.
9. If using dev accounts, switch accounts and verify there is no flash of the previous account's chats/profiles/lists.
10. Pull-to-refresh and realtime updates should still work; continuity snapshots must not prevent authoritative updates.

## Validation performed
- Expo iOS production export / Metro + Hermes: **2,112 modules, successful**.
- Scoped `git diff --check`: clean for all Step 12 replacement files.
- No native-code changes in this step, so no EAS rebuild is required.
