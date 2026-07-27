# Circles Phase 3C — Personal Social History and Profile Navigation

## Goal

Give every user a private, durable home for their accepted connections and event history while keeping Mutuals focused on discovery and requests. Connected profiles may reveal only information already shared between the two people.

## Guest claim order

A guest who creates a new Circles identity from a reviewed event now follows:

```text
Private guest invitation
→ phone authentication
→ recognizable profile setup
→ reviewed attendance claim
→ People from this event
```

Profile setup requires a display name, unique username, and profile photo. The guest name from the RSVP is used as the initial display name when appropriate. Bio remains optional. An existing account with a complete profile skips this setup.

The attendance claim still does not:

- Join either Circle
- Create a connection
- Start a direct message
- Reveal private posts before connection

## Profile navigation

### Own profile

The owner sees three tappable statistics:

- Posts
- Events
- Connections

**Events** opens a private directory containing:

- Upcoming events available through the user’s Circles
- Reviewed events where the user was confirmed as attended

**Connections** opens the owner’s complete accepted-connection directory.

### Accepted connection’s profile

A connected viewer sees:

- Posts
- Shared events
- Mutual connections

Shared Events contains only reviewed events where both people were confirmed as present. Mutual Connections contains only people whom both users have already accepted. The connected viewer never receives the person’s total event count or full connection list.

### Pre-connection profile

The existing limited shell remains unchanged. It may show contextual counts such as mutual connections, shared Circles, and shared events, but it does not expose tappable private directories.

## Mutuals tab

Mutuals now contains only:

- Trusted-context discovery
- Incoming connection requests
- Invitation access

Accepted connections have moved to the owner’s profile.

## Database enforcement

Migration 038:

- Lets claimed former guests keep the reviewed event in their private history while routing them to the limited People from this event surface
- Removes other users’ total connection count from the profile overview RPC
- Adds viewer-specific profile statistics
- Adds a private/self versus shared/connected event directory
- Adds a full-self versus mutual-only connection directory

The full Circle-member event-detail permission remains unchanged. Claimed guests do not receive Circle names or unrelated event access. The privacy distinction is enforced by Supabase security-definer RPCs rather than only by hidden UI.
