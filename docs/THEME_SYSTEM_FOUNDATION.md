# Circles Theme System Foundation

**Status:** Global and Circle-specific personalization implemented across core and shared surfaces
**Default theme:** Default (clean neutral interface with the approved aqua launch atmosphere)
**Visual direction:** Modern Frutiger Aero — futuristic but cozy, clean but personal

## Purpose

The theme system separates Circles' visual decisions from individual screen files. It allows the app to adopt expressive personalization gradually without turning each screen into unrelated hard-coded colors and animations.

The system supports two layers:

1. **Global user theme** — the account-level visual atmosphere for the overall app.
2. **Circle-specific theme** — a shared atmosphere scoped to one Circle or Our Circle.

## Global preference behavior

Settings now exposes **Appearance** in all builds. The user can:

- preview every curated atmosphere live
- replay the full welcome portal before applying
- apply one global theme to their Circles account
- return to the clean Default theme
- leave the screen without applying and automatically return to the saved theme

Migration `066` stores the private account preference in `public.users.theme_id`. The app also maintains a per-user AsyncStorage cache. On launch, the provider reads the cache and reconciles it with Supabase before the welcome portal becomes visible. Signing out returns the signed-out experience to the Default theme without deleting the saved per-account cache.

## Files

- `src/theme/themes.js`
  - Semantic colors
  - Welcome and fluid-surface tokens
  - Motion durations
  - Spacing, radii, and typography tokens
  - Curated theme registry
  - Theme-resolution and token-merging helpers
- `src/theme/ThemeProvider.js`
  - Global `ThemeProvider`
  - Saved-versus-preview theme state
  - Account hydration and local-cache reconciliation
  - Nested `ThemeScope` for Circle-specific themes
  - `useTheme()` and `useThemeTokens()` hooks
- `src/services/themePreferenceService.js`
  - Supabase preference reads/writes
  - Per-user local theme cache
  - Fallback normalization
- `src/screens/profile/AppearanceScreen.js`
  - Production theme selection and live preview
- `src/theme/colors.js`
  - Backward-compatible `COLORS` export for screens not yet migrated
- `src/theme/index.js`
  - Public theme-system exports

## Initial curated themes

- Default
- Aqua Daylight
- Citrus Garden
- Bubblegum Sky
- After Rain

Default is the neutral fallback for new accounts and for users who prefer the original clean Circles styling. Aqua Daylight and the other expressive atmospheres remain opt-in. Development builds still expose **Settings → Theme Laboratory** for temporary design experimentation. Laboratory changes remain in memory and are not saved unless the user applies a theme through the production Appearance screen.

## Adoption pattern

New or migrated screens should read semantic tokens instead of literal colors:

```js
import { useThemeTokens } from '../theme/ThemeProvider';

const theme = useThemeTokens();

<View style={{ backgroundColor: theme.colors.bg }} />
```

A Circle-specific surface can be scoped without changing the global theme:

```js
import { ThemeScope } from '../../theme/ThemeProvider';

<ThemeScope themeId={circle.theme_id}>
  <CircleProfileContent />
</ThemeScope>
```

A Circle with no explicit shared theme can omit `themeId` and inherit the user's global preference.

## Migration strategy

1. Welcome and launch atmosphere
2. Global theme persistence and Appearance
3. Circle profile headers and Circle More
4. Circle/Our Circle shared theme selection
5. Planning, events, polls, RSVP, and completed-memory surfaces
6. Circle posts, Timeline, comments, and post editors
7. Remaining invitations and member-management surfaces
8. Feed, Mutuals, Circles, Me, account settings, and core navigation surfaces
9. Remaining global secondary screens
10. Theme-specific navigation stations and icon families

Safety, moderation, account deletion, and dense form screens should use restrained theme tokens even when expressive themes are active.

## Guardrails

- Themes change presentation, never permissions or product state.
- Text contrast and accessibility remain mandatory.
- Motion respects the operating system's reduced-motion setting.
- Circle themes must not make private drafts or relationship state appear public.
- Curated themes are preferred over unrestricted free-form styling initially.
- A global theme is private account state; a Circle theme will be shared Circle state.

## Shared Circle themes (Migration 067)

Circle personalization is layered beneath the user's global Appearance choice.

- `conversations.theme_id = null` means the Circle inherits each viewer's own global theme.
- A stored curated theme id gives the shared Circle the same atmosphere for every member.
- Group Circle theme changes are limited to owners and admins.
- Both members of an open two-person Circle have equal theme control.
- Closed two-person Circles preserve their saved theme but cannot be customized until reopened.
- `CircleThemeBoundary` scopes profile and More surfaces without changing global tabs, welcome, or unrelated Circles.

Theme-aware Circle surfaces now include:

1. Circle and Our Circle profile headers, counters, actions, tabs, and empty states
2. Circle More identity, feature rows, and the Circle customization selector
3. Regular Circle events, polls, RSVP, attendance review, photo galleries, and repeat-event surfaces
4. Our Circle shared plans, editors, details, completed memories, and plan-to-memory linking
5. Circle posts, post details, private comments, post editors, and the automatic Chat Timeline
6. Our Circle Important Dates, private/shared Thoughts, Shared Albums, and photo-detail/editor flows
7. Circle People, member roles, pending invitations, Circle invite selection, event-attendee connections, and controlled guest-management flows

Feature screens rely on the native navigation title and avoid redundant decorative title headers. Each feature route is wrapped in `CircleThemeBoundary` rather than reading `conversations.theme_id` independently. This preserves one permission-aware theme source and keeps the shared theme scoped away from global tabs, welcome, and unrelated Circles.


## Default theme and global core surfaces (Migration 068)

Migration `068` adds an explicit `default` theme id for both private account preferences and shared Circle themes.

- New accounts default to the neutral Circles interface.
- Existing saved selections remain unchanged.
- The Default theme keeps the approved aqua welcome/portal atmosphere while using black, white, gray, and restrained neutral accents throughout the app.
- `conversations.theme_id = 'default'` is a real shared neutral theme.
- `conversations.theme_id = null` still means each viewer inherits their own global theme.
- Feed, Mutuals, Circles, Me, account settings, comments, stories, unread badges, and the bottom navigation now read global theme tokens.
- Media remains visually neutral so user photos and videos stay central.
