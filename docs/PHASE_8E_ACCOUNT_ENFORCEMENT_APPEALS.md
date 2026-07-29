# Phase 8E — Account Enforcement Appeals

## Purpose

Phase 8E adds a private, structured appeal path for active account restrictions and suspensions. It does not weaken the enforcement boundary while review is pending and does not expose reporters, reports, or moderation evidence to the affected account.

## Owner experience

A restricted or suspended account can open **Account status → Appeal Account Action**.

The account owner may submit one appeal for the current enforcement action. The appeal must contain 20–4,000 characters and remains private to the owner and authorized senior/admin moderation staff.

While the appeal is submitted or under review:

- The restriction or suspension remains active.
- The appeal does not contact the reporting user.
- The appeal does not reveal reports or reporter identities.
- The appeal does not restore connections, romantic state, or Our Circle access.

The owner can later see a broad result and an optional public explanation.

## Moderation experience

Senior and admin moderators receive **Settings → Enforcement appeals** with New, Reviewing, All, and Resolved queues.

Available decisions:

- Uphold the current action
- Lift the action
- Shorten the remaining duration
- Change a suspension to a read-only restriction
- Close the appeal when the action is no longer active

Private moderator notes remain internal. Appeal views and decisions are written to `moderation_audit_log`.

## Data boundaries

Direct table access is disabled. Security-definer RPCs provide:

- Owner-only appeal status and submission
- Senior/admin queue and detail access
- Senior/admin resolution actions

The owner never receives report IDs, reporter identities, internal notes, moderator identities, or moderation evidence.

## Persistence

One appeal is allowed per enforcement `starts_at` value. A later, distinct enforcement action may receive a new appeal.

Lifting or modifying an action through appeal does not silently restore prior social or romantic state.
