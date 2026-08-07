# Step 34 — Circle Profile Living Doorway

This is a focused Circle Profile polish pass. It does not add a new feature surface or change Circle privacy.

## What changed

- The Posts side of Circle Profile now includes a quiet **Shared History / Inside this Circle** strip before the Posts/Timeline tabs.
- The strip shows at most four recent memory windows.
- Memory windows reuse existing Timeline data and preserve each memory's personality:
  - event memory artwork / event cover
  - completed plan memory, including a linked-album photo when available
  - passed Important Date milestone
  - shared Thought / note
  - chat photo/video memory
- Tapping a window opens the full Circle Timeline positioned directly on that memory.
- **Open Timeline** opens the living Timeline feed directly.
- The preview is hidden when the Timeline tab is active so the history is not duplicated.
- The preview selection is deterministic and non-engagement-based: newest memory from each available memory family first, then the next newest memories until four slots are filled.
- Group event memories now hydrate quietly in the background on Circle Profile so a recent gathering can appear in the doorway without waiting for the user to switch to Timeline.
- Event-memory loading does not block the Circle identity, posts, or other core content.

## Files

Replace:

`src/screens/conversations/CircleProfileScreen.js`

## Backend / build requirements

- Supabase migration: **none**
- Edge Function deploy: **none**
- Native change: **none**
- EAS rebuild: **none**

## Validation

- `node --check src/screens/conversations/CircleProfileScreen.js` ✅
- Expo iOS/Hermes production export ✅
- 2,122 modules bundled ✅

## Suggested test

Open both a regular Circle and an Our Circle while the Posts tab is active.

Check that:

1. The personalized header/background is still visually dominant.
2. **Inside this Circle** feels like a small preview, not an activity dashboard.
3. If several kinds of memories exist, the windows have useful visual variety.
4. A completed plan with a linked album can use a linked photo in its window.
5. Tapping each window opens Timeline on that exact memory.
6. **Open Timeline** opens the full Timeline feed.
7. Switching to the Timeline tab removes the doorway preview and shows the existing grid normally.
8. Back navigation preserves the Circle Profile without a loading/remount flash.
