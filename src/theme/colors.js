import { DEFAULT_THEME } from './themes';

// Backward-compatible semantic colors for screens that have not yet migrated
// to useThemeTokens(). This keeps the current app visually unchanged while the
// theme system is adopted one surface at a time.
export const COLORS = DEFAULT_THEME.colors;
