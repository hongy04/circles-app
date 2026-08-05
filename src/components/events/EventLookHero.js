import React, { useMemo } from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useThemeTokens } from '../../theme/ThemeProvider';

export const EVENT_LOOK_OPTIONS = [
  { key: 'circle', label: 'Circle', icon: 'ellipse-outline' },
  { key: 'sky', label: 'Sky', icon: 'cloud-outline' },
  { key: 'garden', label: 'Garden', icon: 'leaf-outline' },
  { key: 'sunset', label: 'Sunset', icon: 'sunny-outline' },
  { key: 'twilight', label: 'Twilight', icon: 'moon-outline' },
  { key: 'celebrate', label: 'Celebrate', icon: 'sparkles-outline' },
];

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(77,185,229,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function paletteFor(key, theme) {
  switch (key) {
    case 'sky':
      return ['#D9F4FF', '#A7D9FF', '#DDF8ED'];
    case 'garden':
      return ['#E3F7CB', '#9DDBAE', '#BFEAE4'];
    case 'sunset':
      return ['#FFE1B8', '#FFAA91', '#D9A6E8'];
    case 'twilight':
      return ['#27345F', '#5368A8', '#8B77C4'];
    case 'celebrate':
      return ['#FFE77D', '#FFB8D8', '#A9E9FF'];
    case 'circle':
    default:
      return [
        rgba(theme.circle.accent, 0.22),
        rgba(theme.welcome.brandInk, 0.16),
        theme.circle.accentSoft,
      ];
  }
}

export function EventLookArtwork({ appearanceKey = 'circle', coverUri = null, compact = false, children }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const colors = paletteFor(appearanceKey, theme);
  const dark = Boolean(coverUri) || appearanceKey === 'twilight';

  if (coverUri) {
    return (
      <ImageBackground
        source={{ uri: coverUri }}
        resizeMode="cover"
        style={[styles.artwork, compact && styles.artworkCompact]}
        imageStyle={styles.coverImage}
      >
        <LinearGradient
          colors={compact
            ? ['rgba(7,13,27,0.12)', 'rgba(7,13,27,0.48)']
            : ['rgba(7,13,27,0.08)', 'rgba(7,13,27,0.18)', 'rgba(7,13,27,0.62)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.coverGlow, compact && styles.coverGlowCompact]} />
        {children}
      </ImageBackground>
    );
  }

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0.08, y: 0.05 }}
      end={{ x: 0.92, y: 0.95 }}
      style={[styles.artwork, compact && styles.artworkCompact]}
    >
      <View style={[styles.orb, styles.orbOne, compact && styles.orbCompact]} />
      <View style={[styles.orb, styles.orbTwo, compact && styles.orbCompact]} />
      <View style={[styles.ring, styles.ringOne, compact && styles.ringCompact]} />
      <View style={[styles.ring, styles.ringTwo, compact && styles.ringCompact]} />
      {appearanceKey === 'celebrate' ? (
        <>
          <View style={[styles.spark, styles.sparkOne]} />
          <View style={[styles.spark, styles.sparkTwo]} />
          <View style={[styles.spark, styles.sparkThree]} />
        </>
      ) : null}
      <View style={[styles.tint, dark && styles.tintDark]} />
      {children}
    </LinearGradient>
  );
}

export function EventLookHero({
  appearanceKey = 'circle',
  coverUri = null,
  circleLabel,
  title,
  dateLabel,
  locationLabel,
  isPast = false,
  isCancelled = false,
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const dark = Boolean(coverUri) || appearanceKey === 'twilight';
  const textColor = dark ? '#FFFFFF' : theme.colors.text;
  const softText = dark ? 'rgba(255,255,255,0.82)' : theme.colors.subtext;

  return (
    <View style={styles.heroShell}>
      <EventLookArtwork appearanceKey={appearanceKey} coverUri={coverUri}>
        <View style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <View style={[styles.glassPill, dark && styles.glassPillDark]}>
              <Ionicons name="lock-closed" size={11} color={softText} />
              <Text style={[styles.glassPillText, { color: softText }]} numberOfLines={1}>
                {circleLabel || 'Circle'}
              </Text>
            </View>
            <View style={[styles.stagePill, dark && styles.stagePillDark]}>
              <Text style={[styles.stagePillText, { color: textColor }]}>
                {isCancelled ? 'CANCELLED' : isPast ? 'PAST GATHERING' : 'UPCOMING'}
              </Text>
            </View>
          </View>

          <View style={styles.heroBottom}>
            <Text style={[styles.heroTitle, { color: textColor }]} numberOfLines={3}>
              {title || 'Event'}
            </Text>
            <View style={styles.metaStack}>
              {dateLabel ? (
                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={16} color={softText} />
                  <Text style={[styles.metaText, { color: softText }]} numberOfLines={2}>{dateLabel}</Text>
                </View>
              ) : null}
              {locationLabel ? (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={16} color={softText} />
                  <Text style={[styles.metaText, { color: softText }]} numberOfLines={2}>{locationLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </EventLookArtwork>
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    heroShell: {
      borderRadius: 26,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: rgba(theme.circle.accent, 0.20),
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 9 },
      elevation: 3,
    },
    artwork: {
      minHeight: 246,
      overflow: 'hidden',
      position: 'relative',
    },
    artworkCompact: { minHeight: 74, borderRadius: 16 },
    coverImage: { borderRadius: 0 },
    coverGlow: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 999,
      right: -38,
      top: -54,
      backgroundColor: 'rgba(255,255,255,0.13)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
    },
    coverGlowCompact: { width: 92, height: 92, right: -24, top: -34 },
    tint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.11)',
    },
    tintDark: { backgroundColor: 'rgba(10,18,45,0.08)' },
    orb: {
      position: 'absolute',
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.26)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.34)',
    },
    orbOne: { width: 168, height: 168, right: -36, top: -32 },
    orbTwo: { width: 116, height: 116, left: -24, bottom: -18, backgroundColor: 'rgba(255,255,255,0.18)' },
    orbCompact: { transform: [{ scale: 0.56 }] },
    ring: {
      position: 'absolute',
      borderRadius: 999,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.36)',
    },
    ringOne: { width: 92, height: 92, right: 74, bottom: 30 },
    ringTwo: { width: 54, height: 54, left: 74, top: 28, borderColor: 'rgba(255,255,255,0.28)' },
    ringCompact: { opacity: 0.72 },
    spark: { position: 'absolute', width: 10, height: 10, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.72)', transform: [{ rotate: '18deg' }] },
    sparkOne: { left: '20%', top: '22%' },
    sparkTwo: { right: '24%', top: '48%', width: 7, height: 7 },
    sparkThree: { left: '42%', bottom: '19%', width: 6, height: 6 },
    heroContent: { flex: 1, minHeight: 246, padding: 18, justifyContent: 'space-between' },
    heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    glassPill: {
      maxWidth: '66%',
      minHeight: 30,
      paddingHorizontal: 10,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(255,255,255,0.52)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.70)',
    },
    glassPillDark: { backgroundColor: 'rgba(20,28,65,0.34)', borderColor: 'rgba(255,255,255,0.26)' },
    glassPillText: { flexShrink: 1, fontFamily: 'Manrope_700Bold', fontSize: 10 },
    stagePill: {
      minHeight: 29,
      paddingHorizontal: 10,
      borderRadius: 999,
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.42)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.62)',
    },
    stagePillDark: { backgroundColor: 'rgba(20,28,65,0.34)', borderColor: 'rgba(255,255,255,0.26)' },
    stagePillText: { fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.7 },
    heroBottom: { gap: 11 },
    heroTitle: { maxWidth: '90%', fontFamily: 'Manrope_700Bold', fontSize: 30, lineHeight: 35, letterSpacing: -0.5 },
    metaStack: { gap: 7 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    metaText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13, lineHeight: 18 },
  });
}
