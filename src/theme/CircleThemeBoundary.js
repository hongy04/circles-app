import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { getCircleThemeSettings } from '../services/circleThemeService';
import { subscribeToConversationChanges } from '../services/conversationService';
import { ThemeScope } from './ThemeProvider';

const DEFAULT_SETTINGS = {
  sharedThemeId: null,
  canCustomize: false,
  isTwoPerson: false,
};

// Theme settings are presentation metadata. Keeping the last resolved theme in
// memory lets every screen in the same Circle render in the correct visual
// world immediately instead of flashing a full-screen loader for each route.
// Permissions are still revalidated whenever a boundary gains focus.
const circleThemeSnapshots = new Map();
const THEME_REVALIDATE_AFTER_MS = 60 * 1000;

function readThemeSnapshotEntry(conversationId) {
  if (!conversationId) return null;
  return circleThemeSnapshots.get(String(conversationId)) || null;
}

function readThemeSnapshot(conversationId) {
  return readThemeSnapshotEntry(conversationId)?.settings || null;
}

function isThemeSnapshotFresh(conversationId) {
  const entry = readThemeSnapshotEntry(conversationId);
  return Boolean(
    entry?.settings
    && Date.now() - Number(entry.savedAt || 0) < THEME_REVALIDATE_AFTER_MS
  );
}

function writeThemeSnapshot(conversationId, settings) {
  if (!conversationId || !settings) return;
  circleThemeSnapshots.set(String(conversationId), {
    settings,
    savedAt: Date.now(),
  });
}

const CircleThemeContext = createContext({
  ...DEFAULT_SETTINGS,
  loading: true,
  refreshCircleTheme: async () => {},
});

export function CircleThemeBoundary({ conversationId, children }) {
  const initialSnapshot = readThemeSnapshot(conversationId);
  const [settings, setSettings] = useState(initialSnapshot || DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(!initialSnapshot);
  const conversationIdRef = useRef(conversationId);

  // A navigator can reuse a screen component with different params. Reset to a
  // warm snapshot (or safe global-theme defaults) without ever removing the
  // child screen from the tree.
  useEffect(() => {
    if (conversationIdRef.current === conversationId) return;
    conversationIdRef.current = conversationId;
    const snapshot = readThemeSnapshot(conversationId);
    setSettings(snapshot || DEFAULT_SETTINGS);
    setLoading(!snapshot);
  }, [conversationId]);

  const refreshCircleTheme = useCallback(async () => {
    if (!conversationId) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return null;
    }

    try {
      const next = await getCircleThemeSettings(conversationId);
      const normalized = {
        sharedThemeId: next.themeId,
        canCustomize: next.canCustomize,
        isTwoPerson: next.isTwoPerson,
      };
      writeThemeSnapshot(conversationId, normalized);
      setSettings(normalized);
      return next;
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      // Realtime subscriptions already catch actual Circle changes. Repeating
      // the theme RPC on every quick Profile -> Plans -> Back hop only competes
      // with the destination's useful data requests, so reuse a fresh snapshot
      // for one minute and revalidate after longer absences.
      if (isThemeSnapshotFresh(conversationId)) {
        setLoading(false);
        return undefined;
      }

      refreshCircleTheme().catch(() => {
        setLoading(false);
      });
      return undefined;
    }, [conversationId, refreshCircleTheme])
  );

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      return subscribeToConversationChanges({
        conversationId,
        onConversationChange: () => {
          refreshCircleTheme().catch(() => {});
        },
      });
    }, [conversationId, refreshCircleTheme])
  );

  const value = useMemo(() => ({
    ...settings,
    loading,
    refreshCircleTheme,
  }), [loading, refreshCircleTheme, settings]);

  return (
    <CircleThemeContext.Provider value={value}>
      <ThemeScope themeId={settings.sharedThemeId}>
        {children}
      </ThemeScope>
    </CircleThemeContext.Provider>
  );
}

export function useCircleThemeSettings() {
  return useContext(CircleThemeContext);
}
