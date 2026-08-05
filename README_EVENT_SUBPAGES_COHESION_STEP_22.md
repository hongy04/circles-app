# Circles — Step 22: Event Subpages Cohesion

Apply this patch **on top of the confirmed Step 21 Event Room + Lifecycle state**.

## What changed

### Event Photos
- Carries the event's selected Event Look into a compact memory-room header.
- Adds a calmer gallery tool surface and keeps the actual photo grid/media neutral and opaque.
- Full-screen photo viewing stays black/neutral.

### People From This Event
- Carries the Event Look into the shared-attendance space.
- Reframes the page around "people you were there with" rather than a utility candidate list.
- Keeps the privacy rule prominent: shared attendance gives context, never automatic profile access.

### Guest Settings
- Carries the Event Look into host tools without turning the settings form into a decorative page.
- Simplifies the privacy explanation and keeps controls on restrained theme/glass surfaces.

### Add Event Guest
- Carries the Event Look into the invite flow.
- Clarifies remaining guest spots and distinguishes private-link invitation from manual entry.
- Keeps the privacy boundary visible without dominating the form.

### Attendance Corrections
- Carries the Event Look into the post-event memory correction workspace.
- Makes the optional nature of review explicit: the RSVP-based memory is already handled; only correct exceptions.
- Keeps quick actions and attendee selection available without making the page feel like required homework.

### Availability Poll Detail
- Poll Dates gets a lighter Circle-themed planning room rather than pretending to have an Event Look before an event exists.
- Cold opens render the poll destination immediately instead of a blank centered loader.
- Host/location/description are grouped more calmly.
- Host finalization copy is simplified to "Make this the event".
- Circle Events now passes the poll title forward for a better first paint.

## Intentional hierarchy
- `Plans & Events` parent: simple Circle theme.
- `Poll Dates`: Circle theme (not yet an event).
- Specific event pages/subpages: compact Event Look identity.
- Photos/media themselves: neutral.

## No behavior changes
This patch does not alter RSVP rules, attendance assumptions, guest permissions, photo permissions, shared-event connection eligibility, poll voting/finalization rules, or event lifecycle logic.

## Validation
- JavaScript syntax checks: PASS
- iOS Expo/Hermes production export: PASS (2,118 modules)
- No native changes
- No Supabase migration
