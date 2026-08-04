# Circles — Utility Surfaces Cohesion Step 10

This patch continues the theme/glass cohesion pass from Feed + Mutuals into secondary screens without changing product behavior.

## Changed surfaces

### Notifications
- Global theme atmosphere behind the activity list.
- Notification rows are now light translucent cards instead of flat full-width rows.
- Unread rows use a quiet theme-accent wash and border.
- Error, empty, and loading states use the same glass language.
- Pull-to-refresh uses the active theme accent.

### Settings
- Theme atmosphere now carries behind Settings.
- Top bar and grouped settings sections use quieter translucent surfaces.
- Row icons inherit the active theme accent instead of generic gray boxes.
- Press states and separators use subtle theme color.
- No settings/navigation behavior changed.

### Push Notifications
- Theme atmosphere behind the status screen.
- Status/privacy/loading cards now match the newer glass system.
- Primary notification action remains visually strong and readable.
- Privacy copy and device-registration behavior are unchanged.

### Circle Plans & Events
- The Circle's scoped theme now shows through the background more clearly.
- Create/Poll controls sit in a light glass action island.
- Event, availability-poll, error, and empty cards use restrained Circle-tinted glass.
- Counts/status pills and icon tiles inherit the Circle accent.
- Existing event loading, poll behavior, RSVP behavior, history, and quiet refresh logic are unchanged.

### Our Circle Shared Plans
- Uses the scoped Our Circle atmosphere and matching glass cards.
- New Idea action is separated into a clean action island.
- Plan status badges/icons inherit the shared theme.
- Realtime refresh, plan lifecycle, and memory behavior are unchanged.

## Deliberately not changed
- Appearance already has its own rich live-theme/portal preview treatment, so this pass does not flatten or rebuild it.
- Event detail/edit forms are not changed yet.
- Notification routing, safety privacy rules, plan/event logic, and navigation continuity are untouched.

## Suggested test
1. Switch to two visually different global themes and open Notifications, Settings, and Push Notifications.
2. Confirm cards remain easy to read and the atmosphere is visible mainly in the gaps/background.
3. Open a regular Circle with a Circle-specific theme → Plans & Events.
4. Check Poll Dates, Create Event, poll cards, upcoming/past event cards, pull-to-refresh, and an empty/error state if available.
5. Open an Our Circle with a shared theme → Plans.
6. Confirm plan cards, memories, New Idea, navigation into details, and back-navigation continuity still behave normally.
7. Verify photos/media/content surfaces elsewhere remain neutral and unchanged.

## Validation
- JS syntax checks: passed
- Scoped `git diff --check`: passed
- Expo iOS production export: passed (2,111 modules)
- No native changes; no EAS rebuild required
