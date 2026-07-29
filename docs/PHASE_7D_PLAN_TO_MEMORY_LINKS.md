# Phase 7D — Plan-to-Memory Links

## Purpose

A completed shared plan is already a memory. Phase 7D lets the two members deliberately make that memory richer by connecting it to one shared album and one shared Circle post.

This phase does not copy photos, duplicate posts, or publish anything automatically.

## Lifecycle

```text
Completed shared plan
→ optional linked album
→ optional linked shared post
→ richer memory with preserved provenance
```

## Album behavior

From a completed plan, either member may:

- Link an existing album from the same unlocked Our Circle.
- Create a new album prefilled from the plan title, date, and memory note.
- Replace the linked album.
- Unlink the album without deleting it.

The album remains an independent shared album. Deleting it clears the link automatically.

## Shared-post behavior

From a completed plan, either member may:

- Link an existing shared post from the same unlocked Our Circle.
- Deliberately create a new post with a prefilled caption.
- Replace the linked post.
- Unlink the post without deleting it.

The post remains an independent Circle post. Creating a plan memory never publishes a post by itself.

## Privacy and consent

- Only completed plans may receive memory links.
- The plan, album, and post must belong to the same unlocked two-person Circle.
- The existing album and post privacy RPCs still control content access.
- Locking the Our Circle hides the plan, album, post, and their links without deleting them.
- Reopening restores the same links when the referenced content still exists.
- Analytics record only link or unlink actions, never content, IDs, titles, captions, dates, or identities.

## Feature flag

`two_person_plan_memory_links`
