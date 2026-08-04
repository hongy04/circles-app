import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useThemeTokens } from '../theme/ThemeProvider';

function rgba(hex, alpha) {
  const value = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(255,255,255,${alpha})`;
  const number = Number.parseInt(value, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ContinuityLoadingCard({
  label = 'Loading…',
  body = '',
  icon = null,
  error = '',
  retryLabel = 'Try again',
  onRetry,
  compact = false,
  style,
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.card, compact && styles.compactCard, style]}>
      <View style={styles.iconWrap}>
        {error ? (
          <Ionicons name={icon || 'alert-circle-outline'} size={compact ? 20 : 24} color={theme.circle.accent} />
        ) : icon ? (
          <Ionicons name={icon} size={compact ? 20 : 24} color={theme.circle.accent} />
        ) : (
          <ActivityIndicator size="small" color={theme.circle.accent} />
        )}
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{error || label}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
      {error && onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    card: {
      minHeight: 92,
      marginVertical: 12,
      paddingHorizontal: 15,
      paddingVertical: 14,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: rgba(theme.circle.accent, 0.20),
      backgroundColor: rgba(theme.colors.surface, 0.88),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowColor: theme.colors.text,
      shadowOpacity: 0.035,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 1,
    },
    compactCard: {
      minHeight: 68,
      marginVertical: 8,
      paddingVertical: 10,
      borderRadius: 15,
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: rgba(theme.circle.accent, 0.10),
    },
    copy: { flex: 1, minWidth: 0 },
    label: {
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      lineHeight: 19,
    },
    body: {
      marginTop: 3,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 12,
      lineHeight: 17,
    },
    retry: {
      minHeight: 34,
      paddingHorizontal: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.welcome.brandInk,
    },
    retryText: {
      color: '#fff',
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    pressed: { opacity: 0.72 },
  });
}
