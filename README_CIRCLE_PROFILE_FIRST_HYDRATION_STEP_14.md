# Circles — Circle Profile First Hydration Step 14

Apply this patch **on top of Steps 12 + 13**.

## What this fixes

Step 13 correctly preserved a mounted Circle Profile when navigating to a child screen and back, but a Step 12 cache assumption caused a separate first-load regression:

- Chat/details could cache only the Circle identity (name, members, etc.).
- Circle Profile interpreted that identity cache as proof that the full profile had already loaded.
- The 20-second return-preservation guard could therefore skip the first posts/timeline/decoration fetch.
- The screen showed empty-state copy until pull-to-refresh forced the missing fetch.

Step 14 separates **warm identity** from **completed Circle Profile hydration**.

## New behavior

- Cached conversation identity can paint the Circle shell immediately.
- Circle Profile **always performs its first authoritative hydration**, even when identity was preloaded by Chat/details.
- The first hydration is quiet when a warm shell is available; it does not bring back the full-screen loading interruption.
- Cached Circle posts/timeline/plans/dates/albums can warm-start a genuine remount.
- Circle decoration is now cached separately as a short-lived, in-memory navigation snapshot.
- If identity is warm but posts/timeline have never loaded, the grid shows a small inline loading state instead of incorrectly saying there are no posts.
- Step 13's short Back-navigation preservation remains intact.

## Test checklist

1. Relaunch/sign in so you can test a genuinely fresh navigation path.
2. Open a Circle from Chat or another surface that already knows the Circle identity.
3. Confirm the Circle Profile loads its posts/header/background automatically — **do not pull to refresh**.
4. If the content takes a moment on the very first open, confirm you see an inline loading state rather than a false `No Circle posts yet` state.
5. Open `Plans & Events`, then Back.
6. Confirm the Circle Profile is still exactly where you left it and does not rebuild.
7. Repeat with People / More / Posts if convenient.
8. Reopen the same Circle after leaving it; cached content may paint immediately while the screen quietly revalidates.

No native changes are included; no EAS rebuild is required.
