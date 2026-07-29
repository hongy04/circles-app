# Phase 8G — Private Safety Outcome Notifications

## Purpose

Close the owner-communication gap after a safety review without adding intrusive popups or exposing sensitive moderation information.

Completed safety report reviews, account-action appeals, and birth-date correction requests now enter the existing private notification center. The notification is intentionally broad and routes the owner to the already protected receipt or request screen for the actual result.

## Owner experience

The notification center may show:

- Circles completed an update on a safety report you submitted.
- Circles completed the review of your account-action appeal.
- Circles completed the review of your birth-date correction request.

Tapping routes to:

- Reports you submitted
- Account appeal
- Birth Date Correction

A resolved appeal is also surfaced on Account Status so a suspended user can see that review completed even while the normal app tabs remain unavailable.

## Privacy contract

The notification row never contains:

- The reported account
- The reporter
- A moderator identity
- Evidence or report details
- Internal moderation notes
- A birth date
- Enforcement rationale or duration

The protected destination screen remains the source of truth for the broad owner-facing outcome.

## Database behavior

Migration 059:

- Adds owner-only target references to the existing `circle_notifications` table.
- Adds three privacy-safe notification types.
- Creates resolution triggers for reports, appeals, and age corrections.
- Backfills one notification for existing completed records.
- Keeps safety notifications independent of conversation mute settings.
- Reuses existing read-state, unread badge, RLS, and realtime behavior.

Updating a completed owner-facing outcome resets that notification to unread rather than creating duplicates.

## Test sequence

1. Run Migration 059.
2. Resolve or dismiss a report and switch to the reporter.
3. Open Notifications and confirm the broad report update appears.
4. Tap it and confirm Reports you submitted opens.
5. Resolve an account appeal and switch to the affected account.
6. Confirm Account Status shows Appeal review completed.
7. After normal tabs are available, confirm the appeal notification routes to Account Appeal.
8. Resolve a birth-date correction request.
9. Confirm the owner receives the broad correction notification.
10. Confirm no notification row displays a person, birth date, report reason, moderator, or private note.
