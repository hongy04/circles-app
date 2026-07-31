import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { supabase } from '../lib/supabase';
import {
  cacheThemePreference,
  fetchMyThemePreference,
  normalizeThemeId,
  readCachedThemePreference,
  saveMyThemePreference,
} from '../services/themePreferenceService';
import {
  DEFAULT_THEME,
  DEFAULT_THEME_ID,
  getTheme,
  isKnownTheme,
  mergeThemeTokens,
  resolveTheme,
} from './themes';

const noop = () => {};
const asyncNoop = async () => DEFAULT_THEME_ID;

const ThemeContext = createContext({
  themeId: DEFAULT_THEME_ID,
  savedThemeId: DEFAULT_THEME_ID,
  theme: DEFAULT_THEME,
  themeReady: false,
  setThemeId: noop,
  setThemeOverrides: noop,
  resetTheme: noop,
  restoreSavedTheme: noop,
  hydrateThemeForUser: asyncNoop,
  saveThemeId: asyncNoop,
});

export function ThemeProvider({
  children,
  initialThemeId = DEFAULT_THEME_ID,
  initialOverrides = null,
}) {
  const normalizedInitialThemeId = normalizeThemeId(initialThemeId);
  const [themeId, setThemeIdState] = useState(normalizedInitialThemeId);
  const [savedThemeId, setSavedThemeId] = useState(normalizedInitialThemeId);
  const [themeOverrides, setThemeOverrides] = useState(initialOverrides);
  const [themeReady, setThemeReady] = useState(false);

  const mountedRef = useRef(true);
  const activeUserIdRef = useRef(null);
  const savedThemeIdRef = useRef(normalizedInitialThemeId);
  const themeReadyRef = useRef(false);
  const hydrationRef = useRef({ userId: null, promise: null });
  const hydrationVersionRef = useRef(0);

  const applySavedTheme = useCallback((nextThemeId) => {
    const normalized = normalizeThemeId(nextThemeId);
    savedThemeIdRef.current = normalized;
    setSavedThemeId(normalized);
    setThemeIdState(normalized);
    setThemeOverrides(null);
    return normalized;
  }, []);

  const markThemeReady = useCallback((ready) => {
    themeReadyRef.current = ready;
    if (mountedRef.current) setThemeReady(ready);
  }, []);

  const resetForSignedOut = useCallback(() => {
    hydrationVersionRef.current += 1;
    hydrationRef.current = { userId: null, promise: null };
    activeUserIdRef.current = null;
    applySavedTheme(DEFAULT_THEME_ID);
    markThemeReady(true);
  }, [applySavedTheme, markThemeReady]);

  const hydrateThemeForUser = useCallback(async (userId) => {
    if (!userId) {
      resetForSignedOut();
      return DEFAULT_THEME_ID;
    }

    if (
      activeUserIdRef.current === userId
      && themeReadyRef.current
    ) {
      return savedThemeIdRef.current;
    }

    if (
      hydrationRef.current.userId === userId
      && hydrationRef.current.promise
    ) {
      return hydrationRef.current.promise;
    }

    const hydrationVersion = hydrationVersionRef.current + 1;
    hydrationVersionRef.current = hydrationVersion;
    activeUserIdRef.current = userId;
    markThemeReady(false);

    const hydrationPromise = (async () => {
      const cachedThemeId = await readCachedThemePreference(userId);

      if (
        mountedRef.current
        && hydrationVersionRef.current === hydrationVersion
        && activeUserIdRef.current === userId
      ) {
        applySavedTheme(cachedThemeId);
      }

      let resolvedThemeId = cachedThemeId;

      try {
        resolvedThemeId = await fetchMyThemePreference();
        await cacheThemePreference(userId, resolvedThemeId);
      } catch {
        // The remote preference is intentionally non-critical. This also lets
        // the app keep opening before Migration 066 is applied locally.
      }

      if (
        mountedRef.current
        && hydrationVersionRef.current === hydrationVersion
        && activeUserIdRef.current === userId
      ) {
        applySavedTheme(resolvedThemeId);
        markThemeReady(true);
      }

      return resolvedThemeId;
    })().finally(() => {
      if (
        hydrationRef.current.userId === userId
        && hydrationRef.current.promise === hydrationPromise
      ) {
        hydrationRef.current = { userId: null, promise: null };
      }
    });

    hydrationRef.current = { userId, promise: hydrationPromise };
    return hydrationPromise;
  }, [applySavedTheme, markThemeReady, resetForSignedOut]);

  const setThemeId = useCallback((nextThemeId) => {
    setThemeIdState(normalizeThemeId(nextThemeId));
    setThemeOverrides(null);
  }, []);

  const resetTheme = useCallback(() => {
    setThemeIdState(DEFAULT_THEME_ID);
    setThemeOverrides(null);
  }, []);

  const restoreSavedTheme = useCallback(() => {
    setThemeIdState(savedThemeIdRef.current);
    setThemeOverrides(null);
  }, []);

  const saveThemeId = useCallback(async (nextThemeId) => {
    const normalizedThemeId = normalizeThemeId(nextThemeId);
    let userId = activeUserIdRef.current;

    if (!userId) {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) throw error;
      if (!session) throw new Error('Please sign in first');

      userId = session.user.id;
      activeUserIdRef.current = userId;
    }

    const persistedThemeId = await saveMyThemePreference(normalizedThemeId);
    await cacheThemePreference(userId, persistedThemeId);

    if (mountedRef.current && activeUserIdRef.current === userId) {
      applySavedTheme(persistedThemeId);
      markThemeReady(true);
    }

    return persistedThemeId;
  }, [applySavedTheme, markThemeReady]);

  useEffect(() => {
    mountedRef.current = true;

    const loadInitialSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mountedRef.current) return;

      if (session?.user?.id) {
        await hydrateThemeForUser(session.user.id);
      } else {
        resetForSignedOut();
      }
    };

    void loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user?.id) {
        resetForSignedOut();
        return;
      }

      const shouldHydrate = (
        event === 'SIGNED_IN'
        || event === 'INITIAL_SESSION'
        || activeUserIdRef.current !== session.user.id
      );

      if (!shouldHydrate) return;

      // Mark the theme unavailable immediately so a post-sign-in portal cannot
      // flash Aqua Daylight. Supabase work itself is deferred outside the auth
      // callback to avoid auth-lock reentrancy.
      markThemeReady(false);
      setTimeout(() => {
        if (mountedRef.current) {
          void hydrateThemeForUser(session.user.id);
        }
      }, 0);
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [hydrateThemeForUser, resetForSignedOut]);

  const theme = useMemo(
    () => resolveTheme(themeId, themeOverrides),
    [themeId, themeOverrides]
  );

  const value = useMemo(
    () => ({
      themeId,
      savedThemeId,
      theme,
      themeReady,
      setThemeId,
      setThemeOverrides,
      resetTheme,
      restoreSavedTheme,
      hydrateThemeForUser,
      saveThemeId,
    }),
    [
      hydrateThemeForUser,
      resetTheme,
      restoreSavedTheme,
      saveThemeId,
      savedThemeId,
      setThemeId,
      theme,
      themeId,
      themeReady,
    ]
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
