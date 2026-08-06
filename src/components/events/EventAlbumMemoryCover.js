import React, { memo, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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

function PreviewImage({ uri, style }) {
  if (!uri) return null;
  return <Image source={{ uri }} resizeMode="cover" style={style} />;
}

function EventAlbumMemoryCoverBase({
  appearanceKey = 'circle',
  coverUri = null,
  previewUrls = [],
  height = 258,
  borderRadius = 26,
  children,
  style,
}) {
  const theme = useThemeTokens();
  const urls = useMemo(
    () => Array.from(new Set((previewUrls || []).filter(Boolean))).slice(0, 3),
    [previewUrls]
  );
  const hasPeeks = urls.length > 0;

  return (
    <View style={[styles.shell, { height, borderRadius }, style]}>
      {hasPeeks ? (
        <View style={StyleSheet.absoluteFillObject}>
          <View style={styles.identityPane}>
            <EventLookArtwork
              appearanceKey={appearanceKey}
              coverUri={coverUri}
              style={{ minHeight: height, height }}
            />
          </View>

          <View style={[styles.peekPane, { borderLeftColor: rgba('#ffffff', 0.72) }]}>
            {urls.length === 1 ? (
              <PreviewImage uri={urls[0]} style={StyleSheet.absoluteFillObject} />
            ) : urls.length === 2 ? (
              <>
                <PreviewImage
                  uri={urls[0]}
                  style={[styles.peekTopHalf, { borderBottomColor: rgba('#ffffff', 0.72) }]}
                />
                <PreviewImage uri={urls[1]} style={styles.peekBottomHalf} />
              </>
            ) : (
              <>
                <PreviewImage
                  uri={urls[0]}
                  style={[styles.peekPrimary, { borderBottomColor: rgba('#ffffff', 0.72) }]}
                />
                <PreviewImage
                  uri={urls[1]}
                  style={[styles.peekBottomLeft, { borderRightColor: rgba('#ffffff', 0.72) }]}
                />
                <PreviewImage uri={urls[2]} style={styles.peekBottomRight} />
              </>
            )}
          </View>
        </View>
      ) : (
        <View style={StyleSheet.absoluteFillObject}>
          <EventLookArtwork
            appearanceKey={appearanceKey}
            coverUri={coverUri}
            style={{ minHeight: height, height }}
          />
        </View>
      )}

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(4,12,24,0.01)', 'rgba(4,12,24,0.08)', 'rgba(4,12,24,0.74)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {hasPeeks ? (
        <View
          pointerEvents="none"
          style={[
            styles.identityEdge,
            { backgroundColor: rgba(theme.circle.accent, 0.18) },
          ]}
        />
      ) : null}

      {children}
    </View>
  );
}

export const EventAlbumMemoryCover = memo(EventAlbumMemoryCoverBase);

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#dce6ec',
    position: 'relative',
  },
  identityPane: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '61%',
    overflow: 'hidden',
  },
  peekPane: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '39%',
    overflow: 'hidden',
    borderLeftWidth: 2,
    backgroundColor: '#d7e1e8',
  },
  peekTopHalf: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '50%',
    borderBottomWidth: 2,
  },
  peekBottomHalf: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
  peekPrimary: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '56%',
    borderBottomWidth: 2,
  },
  peekBottomLeft: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '50%',
    height: '44%',
    borderRightWidth: 2,
  },
  peekBottomRight: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: '50%',
    height: '44%',
  },
  identityEdge: {
    position: 'absolute',
    left: '58%',
    top: 0,
    bottom: 0,
    width: 18,
    opacity: 0.38,
    transform: [{ skewX: '-4deg' }],
  },
});
