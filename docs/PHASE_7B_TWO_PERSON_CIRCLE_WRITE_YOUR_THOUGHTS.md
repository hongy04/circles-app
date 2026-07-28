# Phase 7B — Write Your Thoughts

## Goal

Add a voluntary writing space inside an unlocked two-person Circle where a person can write privately, revise until ready, and deliberately share the finished thought with the other person.

This feature is intended for longer messages, letters, apologies, reflections, or anything that benefits from time before delivery. It is not a streak, journal requirement, emotional score, or automated relationship prompt.

## Lifecycle

```text
Private draft → revise privately → Share with Our Circle → read-only shared thought
```

## Privacy rules

- A private draft is readable only by its author.
- The other member cannot query whether a draft exists, its title, its length, or when it was edited.
- Draft and shared-thought access requires the two-person Circle to be unlocked.
- Locking the Circle hides the content without deleting it.
- Reopening the original Circle restores the same private drafts and shared thoughts to their authorized viewers.
- Sharing is explicit and requires confirmation.
- A shared thought becomes read-only so its meaning cannot be silently revised after delivery.
- The author may remove their own draft or shared thought.
- The recipient cannot edit or remove the author's writing.

## Product behavior

The Our Circle profile adds a **Write Your Thoughts** entry.

The Thoughts screen contains:

- **My private drafts** — visible only to the current author
- **Shared with our Circle** — visible to both members

A draft supports:

- Optional title
- Thought body up to 6,000 characters
- Save and return later
- Deliberate Share with Our Circle action
- Removal before sharing

A shared thought shows:

- Optional title
- Full body
- Author
- Shared date and time
- Read-only provenance notice
- Author-only removal action

## Explicitly excluded

- Required prompts
- Daily writing reminders
- Streaks
- Frequency scoring
- Sentiment or emotional grading
- AI-generated relationship judgments
- Silent editing after sharing
- Public visibility
- Notifications designed to pressure a response

## Analytics

Privacy-safe events:

- `two_person_thought_draft_created`
- `two_person_thought_draft_updated`
- `two_person_thought_shared`
- `two_person_thought_removed`

Analytics contain only the controlled action and whether the item was a draft or shared. They do not contain titles, body text, IDs, conversation IDs, names, length, or counterpart identity.

## Verification

1. Create a private draft from Account A.
2. Confirm Account B cannot see the draft or any indication that it exists.
3. Close and reopen the draft from Account A and confirm the writing remains.
4. Edit and save the draft.
5. Share it and confirm Account B sees it through Realtime.
6. Confirm the shared thought cannot be edited.
7. Confirm only the author sees the remove action.
8. Lock the Our Circle and confirm thoughts are inaccessible.
9. Reopen the Circle and confirm the preserved content returns.
