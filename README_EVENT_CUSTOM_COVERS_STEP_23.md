# Circles Step 23 — Custom Event Covers

Apply this patch on top of the confirmed Step 22 state.

## What it adds

- Preset Event Looks remain the fast/default path.
- Event hosts can optionally choose a custom photo during Create Event.
- The picker uses a wide 16:9 crop; the upload is converted to JPEG and reduced to a maximum width of 1600px.
- Custom photo overrides the preset visually; the selected preset remains the fallback if the photo is removed.
- Hosts can add/change/remove the event photo later from Event Detail.
- Custom cover follows into:
  - Event Detail
  - Event Photos
  - People From This Event
  - Guest Settings
  - Invite Guest
  - Attendance Corrections
  - outside-guest private invitation / RSVP page
- Full-screen gallery media stays neutral.
- Plans & Events parent remains Circle-theme-led rather than photo-wallpaper-heavy.

## Privacy/storage design

- Covers live in the existing private `event-media` bucket.
- Only the event host can prepare/finalize/change/remove a cover.
- Authenticated event viewers receive short-lived signed URLs.
- Outside guests never receive the raw Storage path.
- `event-photo-access` validates the private invitation token with service-role access, then returns a 10-minute signed cover URL.
- A prepared upload path is recorded before Storage accepts the object, limiting cover uploads to server-prepared paths.

## Required backend steps

Apply Migration 080:

```bash
npx supabase db push
```

Deploy the updated guest media Edge Function:

```bash
npx supabase functions deploy event-photo-access
```

The Edge Function already uses the same Supabase server credentials as the existing private event-photo delivery flow; no new secret is introduced by this patch.

## Test checklist

### Custom cover creation
1. Open a Circle → Plans & Events → Create Event.
2. Under Event Look, tap **Add your own photo**.
3. Pick/crop a photo and create the event.
4. Confirm Event Detail uses the custom image as its hero.
5. Confirm title/date/location remain readable over bright and dark photos.

### Host editing
1. On Event Detail, tap **Change photo**.
2. Pick a different image and confirm it replaces the old cover.
3. Tap **Change photo** again → **Use preset instead**.
4. Confirm the original preset Event Look returns immediately.
5. Add a cover again to confirm replacement still works.

### Event subpages
From the covered event, open:
- Photos
- People From This Event
- Guest Settings
- Invite Guest
- Correct Attendance (on a past event where available)

Confirm the compact event header uses the same cover without turning the content area into a photo wallpaper.

### Outside guest link — important
1. Make sure the event allows outside guests.
2. Create/share a private guest invitation.
3. Open that link as an outside guest (ideally a browser/incognito context without the host account signed in).
4. Confirm the custom event photo is prominent at the top of the private invitation/RSVP page.
5. Confirm RSVP still works.
6. Confirm attendee/photo privacy behavior remains unchanged.
7. Remove/change the cover as the host, then reopen the guest link and confirm it reflects the current cover/preset.

### Fallback
1. Create an event without a custom photo.
2. Confirm its preset Event Look behaves exactly as before.

## Validation performed

- Changed JavaScript syntax checks: PASS
- Edge Function TypeScript syntax/transpile check: PASS
- iOS Expo/Hermes production export: PASS (`2119` modules)
- Web Expo production export: PASS (`1906` modules during validation)
- Changed-file trailing-whitespace check: PASS
- No native module changes; no EAS iOS build required.
