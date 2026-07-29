# Phase 9B — Account Deletion and Anonymized Shared-History Preservation

## Goal

Provide a clear in-app account-deletion path that removes the Circles Auth identity and private personal data without corrupting another person's factual event, Circle, moderation, or shared-plan history.

## Owner flow

The owner opens **Settings → Delete account**, reads the deletion boundary, types `DELETE`, and confirms one final destructive alert.

Deletion is permanent. It is not a temporary deactivation and it does not preserve a login that can later be restored.

The same flow remains available from **Account Status** when an account is restricted or suspended.

## Removed

- Supabase Auth identity and active sessions
- Display name, username, avatar, bio, and phone/contact matching hash
- Contact edges and uploaded contact hashes
- Connections and pending connection requests
- Personal and Circle invitations
- Blocks owned by or targeting the account
- Romantic preferences, visibility, Interest, Mutual Interest, Focus, and proposals
- Personal posts, stories, comments, and likes
- Messages and Circle posts authored by the account
- Silent messages and private written thoughts authored by the account
- Event and two-person-album photos uploaded by the account
- Event RSVP, attendance, availability, and repeat-event signals owned by the account
- Private age eligibility and correction-request records
- Account enforcement state and appeals owned by the account
- Notifications addressed to the account

## Preserved only as anonymized shared history

Some records belong to more than one person's history. The database therefore keeps a non-login `Deleted account` tombstone row where a stable foreign key is required.

Examples include:

- Existing events and host history
- Shared plans and important dates
- Moderation reports and immutable audit history
- Remaining members' Circle history
- Read-only direct or two-person history after the account leaves

The tombstone contains no username, avatar, biography, contact hash, eligibility record, or Auth identity. It cannot receive requests, invitations, messages, or romantic actions.

## Direct and two-person spaces

All direct conversations involving the deleted account are closed. Remaining members may retain factual history, but new messages and Circle posts are rejected at the database layer.

If the direct conversation had become an Our Circle, its access period closes and the Circle is locked. The deleted account's membership is removed.

Ordinary group Circles continue for remaining members. If the deleted account was the owner, ownership transfers to the oldest remaining admin or member before deletion.

## Storage deletion

The `account-deletion` Edge Function removes:

- The owner's `avatars/<user-id>` folder
- The owner's `posts/<user-id>` folder
- The owner's `stories/<user-id>` folder
- Message and Circle-post objects authored by the owner in `conversation-media`
- Circle avatars uploaded by the owner
- Event photos uploaded by the owner in `event-media`
- Our Circle album photos uploaded by the owner in `two-person-album-media`

The database transaction stores an internal storage manifest before deleting rows. If Storage or Auth deletion temporarily fails, the same owner may retry the same receipt without re-creating account data.

## Server boundary

The mobile client never receives service-role credentials. It invokes the authenticated `account-deletion` Edge Function, which:

1. Verifies the current JWT and typed confirmation.
2. Calls the service-role-only `prepare_account_deletion(uuid)` RPC.
3. Deletes the captured Storage objects.
4. Deletes the Supabase Auth user.
5. Finalizes the private deletion receipt.

`account_deletion_receipts` has no anon or authenticated table access.

## Deployment

1. Deploy the Edge Function with normal JWT verification:

```bash
npx supabase functions deploy account-deletion
```

Do **not** use `--no-verify-jwt` for this function.

2. Run Migration 061:

```text
supabase/migrations/20260729_061_account_deletion.sql
```

3. Restart Expo with a clear cache.

## Test boundary

Use a disposable development account. Deletion is intentionally irreversible and removes that account from Supabase Auth, so it can no longer be selected by the development account switcher.

Before deletion, give the disposable account:

- A personal post and story
- A connection and direct conversation
- Membership in a group Circle owned by the disposable account
- One event RSVP or photo
- Optional romantic state

After deletion, verify:

- The Auth user is gone.
- The public user row is anonymized and has `deleted_at`.
- Connections, private state, authored content, and uploads are gone.
- A remaining group member became owner.
- The remaining direct-chat member may see old non-deleted history but cannot send new content.
- No request or invitation can target the tombstone.
- The deletion receipt is `complete`.
