import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeTokens } from '../../theme/ThemeProvider';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(10,18,34,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ProfilePostGridItem({
  post,
  onPress,
  onMenuPress,
  isMutualPreview = false,
  size,
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [imageFailed, setImageFailed] = useState(false);
  const isVideo = post.mediaType === 'video';
  const canShowImage = Boolean(post.previewUrl) && !isVideo && !imageFailed;
  const circleSize = size ? Math.max(72, Math.floor(size - 14)) : undefined;

  useEffect(() => {
    setImageFailed(false);
  }, [post.previewUrl]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        size ? { width: size, height: size } : styles.fallbackCell,
        pressed && styles.pressedCell,
      ]}
    >
      <View
        style={[
          styles.circle,
          circleSize ? { width: circleSize, height: circleSize, borderRadius: circleSize / 2 } : styles.fallbackCircle,
        ]}
      >
        <View style={styles.mediaFallback}>
          <Ionicons
            name={isVideo ? 'play' : 'image-outline'}
            size={isVideo ? 26 : 24}
            color="#fff"
          />
          <Text style={styles.fallbackLabel}>{isVideo ? 'Video' : 'Photo'}</Text>
        </View>

        {canShowImage ? (
          <Image
            source={{ uri: post.previewUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : null}

        {isVideo ? (
          <View style={styles.videoBadge}>
            <Ionicons name="play" size={12} color="#fff" />
          </View>
        ) : null}

        {onMenuPress ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation?.();
              onMenuPress();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Manage post"
            style={({ pressed }) => [
              styles.menuBadge,
              pressed && styles.pressedBadge,
            ]}
          >
            <Ionicons name="ellipsis-horizontal" size={14} color="#fff" />
          </Pressable>
        ) : null}

        {post.mediaCount > 1 ? (
          <View style={styles.mediaCountBadge}>
            <Ionicons name="copy-outline" size={11} color="#fff" />
            <Text style={styles.mediaCountText}>{post.mediaCount}</Text>
          </View>
        ) : null}

        {isMutualPreview ? (
          <View style={styles.previewBadge}>
            <Ionicons name="eye" size={11} color="#fff" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function createStyles(theme) {
  const expressive = theme.id !== 'default';
  const edgeColor = expressive
    ? rgba(theme.circle?.accent || theme.colors.text, 0.48)
    : rgba(theme.colors.text, 0.12);

  return StyleSheet.create({
    cell: {
      flexGrow: 0,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    fallbackCell: {
      width: '33.333333%',
      aspectRatio: 1,
    },
    circle: {
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceMuted || '#EFEFEF',
      borderWidth: 1,
      borderColor: edgeColor,
    },
    fallbackCircle: {
      width: '86%',
      aspectRatio: 1,
      borderRadius: 999,
    },
    pressedCell: {
      opacity: 0.84,
      transform: [{ scale: 0.975 }],
    },
    pressedBadge: {
      opacity: 0.72,
    },
    mediaFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#353535',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackLabel: {
      color: '#fff',
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 10,
      marginTop: 2,
    },
    videoBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      width: 21,
      height: 21,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.58)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.60)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mediaCountBadge: {
      position: 'absolute',
      left: 8,
      bottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.58)',
      paddingHorizontal: 6,
      height: 20,
    },
    mediaCountText: {
      color: '#fff',
      fontFamily: 'Manrope_700Bold',
      fontSize: 9.5,
    },
    previewBadge: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      width: 21,
      height: 21,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.64)',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
