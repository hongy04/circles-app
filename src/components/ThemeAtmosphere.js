import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(77,185,229,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ThemeAtmosphere({ theme, strength = 1, decals = false }) {
  const palette = theme?.circle?.decalPalette || [];
  const accent = palette[0] || theme?.circle?.accent || '#4DB9E5';
  const accent2 = palette[1] || accent;
  const accent3 = palette[2] || accent2;
  const accent4 = palette[3] || accent;
  const bg = theme?.colors?.bg || '#FFFFFF';
  const scale = Math.max(0, Math.min(1.65, strength));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: bg }]}>
      <LinearGradient
        colors={[
          rgba(accent, 0.046 * scale),
          rgba(accent2, 0.073 * scale),
          rgba(accent3, 0.042 * scale),
          rgba(accent, 0.026 * scale),
        ]}
        locations={[0, 0.34, 0.72, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View
        style={[
          styles.wash,
          styles.topWash,
          { backgroundColor: rgba(accent2, 0.052 * scale) },
        ]}
      />
      <View
        style={[
          styles.wash,
          styles.bottomWash,
          { backgroundColor: rgba(accent, 0.04 * scale) },
        ]}
      />

      {decals ? (
        <View style={StyleSheet.absoluteFillObject}>
          <LinearGradient
            colors={[
              rgba(accent, 0.12 * scale),
              rgba(accent2, 0.035 * scale),
              'rgba(255,255,255,0)',
            ]}
            locations={[0, 0.56, 1]}
            start={{ x: 0.08, y: 0.12 }}
            end={{ x: 0.9, y: 0.9 }}
            style={[styles.decalDisc, styles.decalDiscLarge]}
          />
          <View
            style={[
              styles.decalRing,
              styles.decalRingUpper,
              { borderColor: rgba(accent3, 0.115 * scale) },
            ]}
          />
          <LinearGradient
            colors={[
              rgba(accent4, 0.09 * scale),
              rgba(accent2, 0.02 * scale),
            ]}
            start={{ x: 0.12, y: 0.08 }}
            end={{ x: 0.86, y: 0.94 }}
            style={[styles.decalDisc, styles.decalDiscSmall]}
          />
          <View
            style={[
              styles.decalRing,
              styles.decalRingLower,
              { borderColor: rgba(accent, 0.09 * scale) },
            ]}
          />
          <View
            style={[
              styles.decalDot,
              { backgroundColor: rgba(accent2, 0.10 * scale) },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wash: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  topWash: {
    top: -110,
    right: -80,
  },
  bottomWash: {
    left: -100,
    bottom: -128,
  },
  decalDisc: {
    position: 'absolute',
    borderRadius: 999,
  },
  decalDiscLarge: {
    width: 230,
    height: 230,
    top: 92,
    right: -104,
    transform: [{ rotate: '-14deg' }],
  },
  decalDiscSmall: {
    width: 118,
    height: 118,
    left: -42,
    top: '48%',
  },
  decalRing: {
    position: 'absolute',
    borderWidth: 17,
    borderRadius: 999,
  },
  decalRingUpper: {
    width: 176,
    height: 176,
    top: 238,
    left: -96,
  },
  decalRingLower: {
    width: 238,
    height: 238,
    right: -128,
    bottom: 56,
    borderWidth: 20,
  },
  decalDot: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    right: 52,
    top: '42%',
  },
});
