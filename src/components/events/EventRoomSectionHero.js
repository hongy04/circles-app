import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { EventLookArtwork } from './EventLookHero';
import { useThemeTokens } from '../../theme/ThemeProvider';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(77,185,229,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function EventRoomSectionHero({
  appearanceKey = 'circle',
  coverUri = null,
  eventTitle = 'Event',
  eyebrow = 'EVENT SPACE',
  title,
  body,
  icon = 'sparkles-outline',
  trailingLabel,
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const dark = Boolean(coverUri) || appearanceKey === 'twilight';
  const textColor = dark ? '#FFFFFF' : theme.colors.text;
  const softText = dark ? 'rgba(255,255,255,0.82)' : theme.colors.subtext;

  return (
    <View style={styles.shell}>
      <EventLookArtwork appearanceKey={appearanceKey} coverUri={coverUri} compact>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={[styles.eyebrowPill, dark && styles.darkPill]}>
              <Ionicons name={icon} size={13} color={softText} />
              <Text style={[styles.eyebrow, { color: softText }]} numberOfLines={1}>
                {eyebrow}
              </Text>
            </View>
            {trailingLabel ? (
              <View style={[styles.trailingPill, dark && styles.darkPill]}>
                <Text style={[styles.trailingText, { color: textColor }]} numberOfLines={1}>
                  {trailingLabel}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.copy}>
            <Text style={[styles.eventTitle, { color: softText }]} numberOfLines={1}>
              {eventTitle}
            </Text>
            <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
              {title || 'Event space'}
            </Text>
            {body ? (
              <Text style={[styles.body, { color: softText }]} numberOfLines={3}>
                {body}
              </Text>
            ) : null}
          </View>
        </View>
      </EventLookArtwork>
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    shell: {
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: rgba(theme.circle.accent, 0.18),
      shadowColor: '#000',
      shadowOpacity: 0.055,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,
    },
    content: {
      minHeight: 154,
      padding: 16,
      justifyContent: 'space-between',
      gap: 22,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    eyebrowPill: {
      maxWidth: '72%',
      minHeight: 30,
      paddingHorizontal: 10,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.50)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.70)',
    },
    trailingPill: {
      minHeight: 30,
      maxWidth: '38%',
      paddingHorizontal: 10,
      borderRadius: 999,
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.42)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.62)',
    },
    darkPill: {
      backgroundColor: 'rgba(20,28,65,0.34)',
      borderColor: 'rgba(255,255,255,0.25)',
    },
    eyebrow: {
      flexShrink: 1,
      fontFamily: 'Manrope_700Bold',
      fontSize: 10,
      letterSpacing: 0.55,
      textTransform: 'uppercase',
    },
    trailingText: {
      fontFamily: 'Manrope_700Bold',
      fontSize: 10,
      textAlign: 'center',
    },
    copy: { gap: 4 },
    eventTitle: {
      fontFamily: 'Manrope_700Bold',
      fontSize: 11,
      letterSpacing: 0.15,
    },
    title: {
      fontFamily: 'Manrope_700Bold',
      fontSize: 24,
      lineHeight: 29,
      letterSpacing: -0.35,
    },
    body: {
      marginTop: 2,
      maxWidth: '92%',
      fontFamily: 'Manrope_500Medium',
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
