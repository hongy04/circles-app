# Circles Theme System Foundation

**Status:** Frontend foundation implemented  
**Default theme:** Aqua Daylight  
**Visual direction:** Modern Frutiger Aero — futuristic but cozy, clean but personal

## Purpose

The theme system separates Circles' visual decisions from individual screen files. It allows the app to adopt expressive personalization gradually without turning each screen into a collection of unrelated hard-coded colors and animations.

The foundation supports two future layers:

1. **Global user theme** — the visual atmosphere the user chooses for the overall app.
2. **Circle-specific theme** — a shared visual atmosphere scoped to one Circle or Our Circle.

No database preference or user-facing theme picker is included in this step. A development-only Theme Laboratory can switch themes in memory for review; the selection resets to Aqua Daylight when the app reloads.

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
  - Nested `ThemeScope` for future Circle-specific themes
  - `useTheme()` and `useThemeTokens()` hooks
- `src/theme/colors.js`
  - Backward-compatible `COLORS` export for screens not yet migrated
- `src/theme/index.js`
  - Public theme-system exports

## Initial curated themes

The registry includes token-complete starting points for:

- Aqua Daylight
- Citrus Garden
- Bubblegum Sky
- After Rain

Aqua Daylight remains the default. Development builds can compare all four through Settings → Theme Laboratory, but the alternatives are not user-facing options and are not persisted yet.

## Development preview

Development builds expose **Settings → Theme Laboratory**. It can:

- switch the global theme in memory
- preview the live fluid Circle and palette
- replay the full returning-user welcome portal
- reset to Aqua Daylight

The laboratory does not write to Supabase, survive an app reload, or expose theme controls in production builds.

## Adoption pattern

New or migrated screens should read semantic tokens instead of literal colors:

```js
import { useThemeTokens } from '../theme/ThemeProvider';

const theme = useThemeTokens();

<View style={{ backgroundColor: theme.colors.bg }} />
```

A Circle-specific surface can later be scoped without changing the global theme:

```js
import { ThemeScope } from '../../theme/ThemeProvider';

<ThemeScope themeId={circle.theme_id}>
  <CircleProfileContent />
</ThemeScope>
```

Custom Circle accents can be layered with safe overrides:

```js
<ThemeScope
  themeId={circle.theme_id}
  overrides={{
    circle: {
      accent: circle.accent_color,
    },
  }}
>
  <CircleProfileContent />
</ThemeScope>
```

## Migration strategy

The theme system is intentionally incremental:

1. Welcome and launch atmosphere
2. Shared reusable components
3. Circle profile headers and Circle More
4. Invitations and event surfaces
5. Our Circle shared space
6. Feed and remaining core screens
7. Theme picker and preference persistence

Safety, moderation, account, and dense form screens should use restrained theme tokens even when expressive themes are active.

## Guardrails

- Themes change presentation, never permissions or product state.
- Text contrast and accessibility remain mandatory.
- Motion respects the operating system's reduced-motion setting.
- Circle themes must not make private drafts or relationship state appear public.
- Curated themes are preferred over unrestricted free-form styling in the initial release.
