# Phase 8D — Account Restrictions and Suspension Enforcement

## Purpose

Make senior/admin moderation decisions effective inside Circles. Phase 8B could
record an external restriction or suspension outcome, but it did not actually
change what the account could do.

This phase adds an in-product enforcement boundary while preserving transparent
owner status and immutable moderation history.

## Enforcement states

### Restricted

The account may sign in and read existing authorized content, but cannot create
or change social state. Server-side mutation guards block:

- posts, stories, likes, and comments;
- messages and media uploads;
- connection requests, invitations, and Circle membership changes;
- event creation, RSVPs, guest invitations, photos, and repeat signals;
- romantic settings, private interest, Mutual Focus, and Our Circle actions;
- shared plans, dates, thoughts, albums, and profile customization.

Safety reporting, blocking, report receipts, notification read state, private
age records, account-status viewing, and signing out remain available.

### Suspended

The account is stopped at an Account Status screen instead of entering the
normal tab interface. The same server mutation boundary applies in case an old
or modified client attempts an action directly.

Suspension in this phase is an application-level enforcement record, not a
Supabase Auth ban. Existing short-lived authorization tokens may still be able
to read data permitted by RLS, but the official app gates normal access and the
server denies social mutations.

## Moderator controls

Only active `senior` and `admin` moderation staff can:

- apply a restriction;
- apply a suspension;
- choose 24 hours, 7 days, 30 days, or until lifted;
- provide a neutral message visible to the account owner;
- record a private enforcement note;
- lift the current account action.

The reported account is derived from the reviewed report on the server. A
client cannot choose an arbitrary enforcement target.

Applying an action resolves the source report with the matching controlled
resolution, closes romantic discovery, clears private romantic state, cancels
pending two-person Circle proposals, and locks preserved Our Circle history.
Ordinary social history is not deleted.

Lifting an action does not restore former connections, romantic state, pending
requests, or Our Circle access automatically.

## Auditability

Current state lives in `public.account_enforcements`. Every restrict, suspend,
lift, and automatic expiration action is copied into the append-only
`public.account_enforcement_history` table.

Sensitive moderator views and actions are also written to
`public.moderation_audit_log`.

## Storage boundary

New avatar, personal-post, story, conversation-media, event-photo, and shared
album uploads are denied while an account action is active. Existing authorized
content is preserved.

## Deliberate boundaries

This phase does not add:

- an appeals workflow;
- government-ID or third-party identity verification;
- automatic enforcement based solely on report count;
- permanent content deletion;
- Supabase Auth bans;
- legal hold or emergency law-enforcement procedures.
