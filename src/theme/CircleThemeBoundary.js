import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { getCircleThemeSettings } from '../services/circleThemeService';
import { subscribeToConversationChanges } from '../services/conversationService';
import { ThemeScope, useThemeTokens } from './ThemeProvider';

const CircleThemeContext = createContext({
  sharedThemeId: null,
  canCustomize: false,
  isTwoPerson: false,
  loading: true,
  refreshCircleTheme: async () => {},
});

function BoundaryLoadingState() {
  const theme = useThemeTokens();
  return (
    <View style={[styles.loading, { backgroundColor: theme.colors.bg }]}>
      <ActivityIndicator color={theme.circle.accent} />
    </View>
  );
}

export function CircleThemeBoundary({ conversationId, children }) {
  const [settings, setSettings] = useState({
    sharedThemeId: null,
    canCustomize: false,
    isTwoPerson: false,
  });
  const [loading, setLoading] = useState(true);

  const refreshCircleTheme = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) {
      setLoading(false);
      return null;
    }
    if (!quiet) setLoading(true);

    try {
      const next = await getCircleThemeSettings(conversationId);
      setSettings({
        sharedThemeId: next.themeId,
        canCustomize: next.canCustomize,
        isTwoPerson: next.isTwoPerson,
      });
      return next;
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      refreshCircleTheme().catch(() => {
        if (active) setLoading(false);
      });

      return () => {
        active = false;
      };
    }, [refreshCircleTheme])
  );

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      return subscribeToConversationChanges({
        conversationId,
        onConversationChange: () => {
          refreshCircleTheme({ quiet: true }).catch(() => {});
        },
      });
    }, [conversationId, refreshCircleTheme])
  );

  const value = useMemo(() => ({
    ...settings,
    loading,
    refreshCircleTheme,
  }), [loading, refreshCircleTheme, settings]);

  if (loading) return <BoundaryLoadingState />;

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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
