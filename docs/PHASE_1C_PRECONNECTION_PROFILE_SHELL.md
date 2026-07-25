# Circles Phase 1C — Pre-connection Profile Shell

## Product rule

Trusted overlap makes a person discoverable; it does not make their profile public.

Before two people accept a connection, the profile surface may show only:

- identity: profile photo, name, username, and short bio;
- legitimate shared context already known to Circles;
- the one personal post the profile owner deliberately selected as their Mutuals preview;
- the correct connection-request action or state.

It must not show:

- the private post grid;
- post or connection totals;
- likes, comments, or post-detail navigation;
- messaging access;
- Circle-only posts.

## Legitimate pre-connection context

The shell is available only when at least one of these is true:

- a connection request is pending between the two people;
- their synced-contact graph provides mutual-contact context;
- they share at least one accepted connection;
- they are accepted members of at least one shared Circle.

An arbitrary authenticated user ID is not enough to open the shell.

## Database enforcement

Migration `20260725_021_preconnection_profile_shell.sql` adds the security-definer RPC:

- `get_preconnection_profile_shell(profile_user_id uuid)`

The function independently verifies eligibility and returns only the limited shell fields. It does not rely on the mobile UI as the privacy boundary.

The migration also updates `get_profile_overview` so pre-connection callers receive zero for post and connection totals. Accepted connections and the profile owner keep the existing full-profile behavior.

## Client behavior

`ProfileViewScreen` now chooses one of two paths:

- `can_view_posts = true`: normal full profile and post grid;
- `can_view_posts = false`: pre-connection shell and selected preview only.

The selected preview is intentionally non-interactive. It cannot open the private post-detail surface.

## Manual acceptance checklist

1. Open a Mutuals candidate with a selected preview.
   - Identity, context, selected preview, and Connect appear.
   - No profile totals or private post grid appear.
2. Open a Mutuals candidate without a selected preview.
   - The shell says that no preview was selected.
   - The rest of the profile remains locked.
3. Send a request.
   - Reopening the shell shows Requested rather than another Connect action.
4. Open an incoming request.
   - Accept and Decline are available from the shell.
5. Accept the request.
   - The normal full profile, totals, and post grid become available.
6. Open a non-connected member from a shared Circle.
   - The limited shell opens and shows shared-Circle context.
7. Attempt to open a user with no request, contact, mutual-connection, or shared-Circle context.
   - The profile remains unavailable.
