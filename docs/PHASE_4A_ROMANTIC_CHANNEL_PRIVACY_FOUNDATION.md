# Phase 4A — Romantic Channel Privacy Foundation

## Purpose

Establish the consent and privacy boundary for the future romantic layer before
any private-interest action exists.

This phase does **not** add hearts, private interest, a mutual reveal, Focus, or
a two-person Circle.

## Product behavior

Romance is off by default. A user must:

1. Confirm that they are 18 or older.
2. Turn on **Open to romantic connections**.
3. Choose an audience strategy.
4. Include an accepted connection in their private audience.

A romantic channel is available between two people only when both accepted
connections independently complete those conditions for one another.

Neither person can inspect the other's global setting, audience mode, or
one-sided visibility choice. If the channel is closed, the app does not explain
why.

## Audience strategies

### All accepted connections

Current and future accepted connections are included by default. The user may
exclude individual people.

### Selected people only

No accepted connection is included by default. The user must include people
individually.

Changing strategies resets person-level exceptions to the new default.

## Profile behavior

When the pair-level channel is open, a connected profile displays a neutral
status card explaining that romantic features are available and that no
interest has been shared.

When the channel is closed, nothing appears. No reason is exposed.

## Privacy and safety guarantees

- Only accepted connections are eligible.
- Romance is off by default.
- Enabling requires an 18+ confirmation.
- Pair-level visibility is reciprocal.
- One-sided choices remain private.
- Removing the accepted connection immediately makes the channel unavailable.
- Ordinary profiles, friendships, posts, events, and messages are unaffected.
- The database tables have no direct client policies; security-definer RPCs
  mediate all access.
- Analytics store only controlled actions, audience mode, and aggregate visible
  counts—not target identities or pair state.

## Remote control

Feature flag: `romantic_channel_beta`

Turning the flag off hides the settings and makes every pair-level channel
unavailable without deleting saved private preferences.

## Deferred

- Subtle profile heart
- Private interest storage
- Mutual Interest reveal
- Reset behavior for private interest
- Mutual Focus
- Two-person Circle
- Circle-based audience snapshot shortcuts
- Blocking/reporting integration required before public romantic release
