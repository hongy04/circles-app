# Phase 7C — Shared Occasion Albums

## Purpose

Give an unlocked two-person Circle a deliberate place for photo collections tied to one trip, date, celebration, or meaningful period. This is not an endless general gallery and does not automatically publish into Posts or Timeline.

## Product behavior

- Either member may create an album.
- An album has a title, optional date, optional shared note, and photos.
- Both members have equal rights to edit metadata, add photos, remove photos, or delete the album.
- Photos remain private to the two-person Circle.
- Albums and photos become inaccessible when the Circle is locked, but are not deleted.
- Reopening the original Circle restores the same albums.
- Albums do not automatically create Feed posts, Circle posts, Timeline entries, or notifications.

## Privacy boundary

Photo objects live in a private Supabase Storage bucket. The app can mint short-lived signed URLs only while the requesting user belongs to an unlocked two-person Circle. Previously issued URLs can remain usable until their one-hour expiry.

Analytics record only controlled actions and aggregate counts. They never store album titles, notes, dates, photo paths, album IDs, conversation IDs, or either person’s identity.

## Deferred

- Video albums
- Photo captions and comments
- Linking an album to a shared Plan or Important Date
- Promoting a selected album cover into Timeline
- Advanced ordering and cover selection
