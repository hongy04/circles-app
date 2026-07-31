# Circles Theme System Foundation

**Status:** Global preference layer implemented; Circle-specific personalization next  
**Default theme:** Aqua Daylight  
**Visual direction:** Modern Frutiger Aero — futuristic but cozy, clean but personal

## Purpose

The theme system separates Circles' visual decisions from individual screen files. It allows the app to adopt expressive personalization gradually without turning each screen into unrelated hard-coded colors and animations.

The system supports two layers:

1. **Global user theme** — the account-level visual atmosphere for the overall app.
2. **Circle-specific theme** — a future shared atmosphere scoped to one Circle or Our Circle.

## Global preference behavior

Settings now exposes **Appearance** in all builds. The user can:

- preview every curated atmosphere live
- replay the full welcome portal before applying
- apply one global theme to their Circles account
- return to Aqua Daylight
- leave the screen without applying and automatically return to the saved theme

Migration `066` stores the private account preference in `public.users.theme_id`. The app also maintains a per-user AsyncStorage cache. On launch, the provider reads the cache and reconciles it with Supabase before the welcome portal becomes visible. Signing out returns the signed-out experience to Aqua Daylight without deleting the saved per-account cache.

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

- Aqua Daylight
- Citrus Garden
- Bubblegum Sky
- After Rain

Aqua Daylight remains the default. Development builds still expose **Settings → Theme Laboratory** for temporary design experimentation. Laboratory changes remain in memory and are not saved unless the user applies a theme through the production Appearance screen.

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
5. Invitations and event surfaces
6. Our Circle depth features
7. Feed and remaining core screens
8. Theme-specific navigation stations and icon families

Safety, moderation, account deletion, and dense form screens should use restrained theme tokens even when expressive themes are active.

## Guardrails

- Themes change presentation, never permissions or product state.
- Text contrast and accessibility remain mandatory.
- Motion respects the operating system's reduced-motion setting.
- Circle themes must not make private drafts or relationship state appear public.
- Curated themes are preferred over unrestricted free-form styling initially.
- A global theme is private account state; a Circle theme will be shared Circle state.
