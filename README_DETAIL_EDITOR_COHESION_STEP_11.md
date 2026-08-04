# Circles — Detail & Editor Cohesion Step 11

This patch continues the confirmed Step 10 visual-cohesion direction into the deeper creation/editor/invite flows without changing their data or privacy behavior.

## Included screens

- Create Event
- Create Availability Poll
- Add Event Guest
- Event Guest Settings
- Invite People to Circle
- Two-person Plan Editor
- Personal Invite People / Contacts

## What changed

### Event creation
- Circle-theme atmosphere now carries behind the editor.
- Event details are grouped into one calm glass work area instead of reading as disconnected fields.
- Circle-selection, privacy/context, and guest-rule cards use the same lighter glass hierarchy as the newer live Circle surfaces.
- Inputs remain strong/opaque enough for easy typing while letting the shared theme show around them.

### Availability polls
- Theme atmosphere continues into poll creation.
- Poll metadata lives in a dedicated glass work area.
- Possible-time cards and add-time controls use the same visual hierarchy as Circle Plans & Events.

### Two-person plans
- Our Circle theme is visible behind the editor.
- Idea fields are grouped into a dedicated glass card.
- Proposed-time controls remain visually distinct, preserving the product difference between a lightweight idea and a proposal requiring the other person's choice.

### Guest controls
- Add Guest and Guest Settings now use the active Circle atmosphere and translucent context/control surfaces.
- Manual-vs-link invitation actions are visually clearer without changing the privacy rules or guest-cap behavior.

### Invite flows
- Invite People to Circle inherits the Circle-specific theme.
- Privacy explanation, share-link card, search, candidate list, and bottom action bar are visually integrated.
- Personal Invite People gets the user's global theme atmosphere, glass navigation, invite context card, search, and contact rows.

## Deliberately unchanged

- Event creation logic
- Multi-Circle selection behavior
- Date/time parsing
- Guest caps / plus-one rules
- Availability poll logic
- Two-person plan lifecycle and consent behavior
- Contact permissions
- Invite link generation/sharing
- Circle invite candidate rules
- Keyboard dismissal/search behavior
- Navigation behavior

## Validation

- Scoped `git diff --check`: PASS
- Expo iOS + Hermes production export: PASS
- Bundle size checkpoint: 2,111 modules
- No native changes; EAS rebuild is not required.

## Suggested test pass

1. Open Create Event from two very different Circle themes.
2. Type through title/date/time/location/details and verify keyboard scrolling still feels normal.
3. Toggle multi-Circle and outside-guest controls.
4. Create/open an availability poll editor and add/remove time options.
5. Open Our Circle → Shared Plans → new/edit plan; test idea vs proposed-time fields.
6. Test Add Guest in private-link and manual modes.
7. Open Guest Settings and toggle each host rule.
8. Open Invite People from a Circle, search/select/remove connections, and inspect the bottom send bar.
9. Open Settings → Invite People and test contact search/invite with a bright and restrained global theme.
