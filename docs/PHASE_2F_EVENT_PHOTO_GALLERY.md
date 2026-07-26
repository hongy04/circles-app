# Phase 2F — Event Photo Gallery and Guest Web Viewing

## Goal

Turn a planned gathering into shared history without forcing outside guests to install Circles.

This slice adds an image-only event gallery. Authenticated people who are marked **Going** may upload photos. All current members of the Circles attached to the event may view the gallery. Anyone holding a valid private guest invitation may view the same photos from the account-free invitation page.

## Product boundary

Included:

- Event-level photo gallery
- Up to 10 photos selected per upload
- Image compression before upload
- Private in-app gallery for invited Circle members
- Upload permission for the host and members marked Going
- Removal permission for the uploader or event host
- Account-free, view-only gallery through a valid guest invitation
- Privacy-safe event-photo analytics
- Remote `event_photo_gallery` feature flag

Deferred:

- Guest uploads
- Videos
- Captions, comments, likes, or reactions
- Albums and sorting
- Automatic Circle Timeline promotion
- Host attendance review and completed-event state
- Public discovery or profile linking

## Privacy model

The authenticated gallery returns uploader display context for Circle members. The guest gallery returns only photo object paths and image dimensions. It does not return:

- User IDs
- Usernames
- Uploader names or avatars
- Circle IDs or names
- Event IDs
- Profile links
- Posts, messages, or connections

Guest photos are non-tappable outside the image viewer and do not open any Circles identity surface.

### Storage delivery note

The account-free guest page cannot create private Supabase Storage signed URLs without a server or Edge Function. For this MVP, `event-media` is a public bucket with random, unlisted object paths. Database RPCs reveal those paths only after event-membership or guest-token validation.

A copied image URL may continue working until that photo is removed. A production hardening step should move guest delivery behind an Edge Function that returns short-lived signed URLs. The event-photo table and client gallery can remain unchanged when that is introduced.

## Upload lifecycle

```text
Prepare database slot
→ upload JPEG to the exact allowed Storage path
→ verify the object exists
→ finalize the photo as gallery-ready
```

If upload or finalization fails, the client attempts to remove the object and cancel the pending database row. Pending rows never appear in either gallery.

## Analytics

Allowlisted events:

- `event_photo_uploaded`
- `event_photo_removed`
- `event_photo_gallery_opened`
- `event_guest_photo_gallery_opened`

Properties contain only controlled values such as surface, action, viewer type, and bounded photo count. They do not contain image URLs, Storage paths, invitation tokens, user IDs, event IDs, Circle IDs, or event text.

## Test checklist

1. Run Migration 033.
2. Open an event as the host and enter Event Photos.
3. Add one or more photos and confirm they appear.
4. Open the gallery from another member of an invited Circle and confirm the photos are visible.
5. Mark that member Going and confirm they can upload.
6. Change them to Maybe or Can’t go and confirm upload is no longer offered.
7. Confirm the uploader can remove their own photo.
8. Confirm the host can remove another uploader’s photo.
9. Open a valid guest invitation and confirm the Event Photos section shows the same images.
10. Confirm photos open full-screen but do not open profiles or Circle details.
11. Remove a photo in the app and reload the guest page; confirm it disappears.
12. Revoke the guest invitation and confirm the invitation page, attendee list, and photo gallery are all unavailable.
