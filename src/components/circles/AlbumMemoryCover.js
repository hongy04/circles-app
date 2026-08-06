import React, { memo, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { useThemeTokens } from '../../theme/ThemeProvider';

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

function PreviewImage({ uri, style }) {
  if (!uri) return null;
  return <Image source={{ uri }} resizeMode="cover" style={style} />;
}

function AlbumMemoryCoverBase({
  coverUrl,
  previewUrls = [],
  height = 200,
  borderRadius = 22,
  overlay = true,
  children,
  style,
}) {
  const theme = useThemeTokens();
  const urls = useMemo(
    () => Array.from(new Set((previewUrls || []).filter(Boolean))).slice(0, 3),
    [previewUrls]
  );
  const selectedCover = String(coverUrl || '').trim();

  return (
    <View style={[styles.shell, { height, borderRadius }, style]}>
      {selectedCover ? (
        <PreviewImage uri={selectedCover} style={StyleSheet.absoluteFillObject} />
      ) : urls.length >= 3 ? (
        <View style={StyleSheet.absoluteFillObject}>
          <PreviewImage uri={urls[0]} style={[styles.collagePrimary, { borderRightColor: rgba('#ffffff', 0.72) }]} />
          <PreviewImage uri={urls[1]} style={[styles.collageTop, { borderBottomColor: rgba('#ffffff', 0.72) }]} />
          <PreviewImage uri={urls[2]} style={styles.collageBottom} />
        </View>
      ) : urls.length === 2 ? (
        <View style={StyleSheet.absoluteFillObject}>
          <PreviewImage uri={urls[0]} style={[styles.halfLeft, { borderRightColor: rgba('#ffffff', 0.72) }]} />
          <PreviewImage uri={urls[1]} style={styles.halfRight} />
        </View>
      ) : urls.length === 1 ? (
        <PreviewImage uri={urls[0]} style={StyleSheet.absoluteFillObject} />
      ) : (
        <LinearGradient
          colors={[
            rgba(theme.circle.accent, 0.74),
            rgba(theme.circle.accentSoft || theme.circle.accent, 0.82),
            rgba(theme.welcome?.brandInk || theme.circle.accent, 0.34),
          ]}
          start={{ x: 0.04, y: 0.06 }}
          end={{ x: 0.96, y: 0.94 }}
          style={StyleSheet.absoluteFillObject}
        >
          <View style={[styles.memoryBubble, styles.memoryBubbleOne, { borderColor: rgba('#ffffff', 0.58) }]} />
          <View style={[styles.memoryBubble, styles.memoryBubbleTwo, { borderColor: rgba('#ffffff', 0.38) }]} />
          <View style={styles.placeholderIcon}>
            <Ionicons name="images-outline" size={34} color={rgba('#ffffff', 0.92)} />
          </View>
        </LinearGradient>
      )}

      {overlay ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(4,12,24,0.02)', 'rgba(4,12,24,0.10)', 'rgba(4,12,24,0.72)']}
          locations={[0, 0.46, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}

      {children}
    </View>
  );
}

export const AlbumMemoryCover = memo(AlbumMemoryCoverBase);

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#dce6ec',
  },
  collagePrimary: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '62%',
    borderRightWidth: 2,
  },
  collageTop: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '38%',
    height: '50%',
    borderBottomWidth: 2,
  },
  collageBottom: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: '38%',
    height: '50%',
  },
  halfLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    borderRightWidth: 2,
  },
  halfRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '50%',
  },
  memoryBubble: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 999,
  },
  memoryBubbleOne: {
    width: 108,
    height: 108,
    right: -22,
    top: -12,
  },
  memoryBubbleTwo: {
    width: 72,
    height: 72,
    left: 20,
    bottom: -22,
  },
  placeholderIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
