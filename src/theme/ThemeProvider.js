import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {
  DEFAULT_THEME,
  DEFAULT_THEME_ID,
  getTheme,
  isKnownTheme,
  mergeThemeTokens,
  resolveTheme,
} from './themes';

const noop = () => {};

const ThemeContext = createContext({
  themeId: DEFAULT_THEME_ID,
  theme: DEFAULT_THEME,
  setThemeId: noop,
  setThemeOverrides: noop,
  resetTheme: noop,
});

export function ThemeProvider({
  children,
  initialThemeId = DEFAULT_THEME_ID,
  initialOverrides = null,
}) {
  const [themeId, setThemeIdState] = useState(
    isKnownTheme(initialThemeId) ? initialThemeId : DEFAULT_THEME_ID
  );
  const [themeOverrides, setThemeOverrides] = useState(initialOverrides);

  const setThemeId = useCallback((nextThemeId) => {
    setThemeIdState(isKnownTheme(nextThemeId) ? nextThemeId : DEFAULT_THEME_ID);
  }, []);

  const resetTheme = useCallback(() => {
    setThemeIdState(DEFAULT_THEME_ID);
    setThemeOverrides(null);
  }, []);

  const theme = useMemo(
    () => resolveTheme(themeId, themeOverrides),
    [themeId, themeOverrides]
  );

  const value = useMemo(
    () => ({
      themeId,
      theme,
      setThemeId,
      setThemeOverrides,
      resetTheme,
    }),
    [resetTheme, setThemeId, theme, themeId]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Applies a theme to one subtree without changing the user's global theme.
 * A Circle can later wrap its profile/routes with:
 *   <ThemeScope themeId={circle.theme_id}>...</ThemeScope>
 */
export function ThemeScope({ children, themeId, overrides = null }) {
  const parent = useTheme();
  const resolvedThemeId = isKnownTheme(themeId) ? themeId : parent.themeId;

  const scopedTheme = useMemo(() => {
    const base = themeId ? getTheme(resolvedThemeId) : parent.theme;
    if (!overrides) return base;
    return {
      ...mergeThemeTokens(base, overrides),
      id: resolvedThemeId,
      name: base.name,
      description: base.description,
    };
  }, [overrides, parent.theme, resolvedThemeId, themeId]);

  const value = useMemo(
    () => ({
      ...parent,
      themeId: resolvedThemeId,
      theme: scopedTheme,
    }),
    [parent, resolvedThemeId, scopedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeTokens() {
  return useTheme().theme;
}
