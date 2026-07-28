# Phase 6B — Two-Person Circle Shared Plans

## Status

Implementation ready for Migration 046 and device testing.

## Product boundary

Shared Plans are available only inside an unlocked two-person Circle. They are intentionally smaller and more relational than the group-event system.

A plan follows this lifecycle:

```text
Idea → proposed → scheduled → completed memory
```

The system does not infer agreement. One person proposes a concrete date and time; the other person must accept before the plan becomes scheduled.

## Included

- Private shared Plans directory
- Save an unscheduled idea
- Optional note and place
- Propose a future date and time
- Accept and schedule
- Mark a proposal tentative
- Suggest changes by creating a new version for the other person to accept
- Mark a scheduled plan complete
- Add an optional memory note
- Completed plans appear in the Plans memory section and the shared Circle Timeline grid
- Realtime updates for the two authorized members while the Circle is open
- Feature flag: `two_person_circle_plans`
- First-party privacy-safe analytics

## Consent behavior

- An idea creates no commitment.
- A person cannot accept their own proposal.
- Suggesting changes makes the editor the new proposer and resets the response to pending.
- Tentative does not schedule the plan.
- Either person may complete a scheduled plan.
- Plans are inaccessible while the two-person Circle is locked.
- Locking, disconnection, or ending Focus preserves plan history without exposing it.
- Reopening the original Circle restores the same plans and memories.

## Deferred

- Photo attachments directly on a plan memory
- Important dates and recurring traditions
- Calendar synchronization
- Reminder customization
- General group-event tools, guests, polls, and RSVP counts
- Relationship streaks, scoring, or pressure notifications

## Migration

Run:

```text
supabase/migrations/20260728_046_two_person_circle_shared_plans.sql
```

## Expected analytics

- `two_person_plan_created`
- `two_person_plan_updated`
- `two_person_plan_response_updated`
- `two_person_plan_completed`

Analytics store only controlled action and status values. They do not store plan IDs, titles, notes, locations, dates, conversation IDs, or either member's identity.
