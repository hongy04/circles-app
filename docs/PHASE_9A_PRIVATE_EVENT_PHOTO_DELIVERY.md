# Phase 9A — Private Event-Photo Delivery

## Purpose

Phase 2F used a public `event-media` Storage bucket with random, unlisted paths as an explicit MVP compromise. It allowed account-free guest pages to display event photos before a trusted server delivery path existed, but a copied object URL could continue working until the file was deleted.

Phase 9A replaces that compromise with short-lived signed delivery while preserving the existing event gallery and guest experience.

## Privacy model

### Authenticated Circles users

1. `list_event_photos(event_id)` verifies current event access and returns authorized photo metadata.
2. The client asks Supabase Storage for signed URLs.
3. A Storage SELECT policy re-checks the user against the photo's event before a URL is minted.
4. Each URL expires after 10 minutes.

Losing event access prevents new URLs from being created. Existing URLs naturally stop working when their short lifetime ends.

### Outside guests

1. The guest page sends its 64-character invitation token to the `event-photo-access` Edge Function.
2. The Edge Function uses the existing guest-token validation RPC.
3. Only a valid, unexpired, non-revoked invitation can obtain photo metadata.
4. The Edge Function mints 10-minute signed URLs with the service role.
5. The client receives only display metadata and signed URLs—not raw reusable Storage paths.

The Edge Function is deployed with JWT verification disabled because invited guests may not have Circles accounts. The invitation token itself is the scoped bearer credential.

## Preserved behavior

- Existing event photo rows and files are not moved or renamed.
- Authenticated event galleries still show uploader context and deletion controls.
- Valid guests can still view event photos without installing Circles.
- Guest links still reveal no private profiles, Circle posts, messages, or connections.
- Upload and delete permissions are unchanged.

## Deployment

Run Migration 060, then deploy:

```bash
supabase functions deploy event-photo-access --no-verify-jwt
```

The Supabase-hosted Edge Function automatically receives `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` at runtime.

## Rollback boundary

Reverting the client before restoring the bucket to public would make galleries temporarily unable to render images. Roll back client, Edge Function, and bucket visibility as one deliberate release unit.
