import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';

export function ProfilePostGridItem({ post, onPress, onMenuPress, size }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isVideo = post.mediaType === 'video';
  const canShowImage = Boolean(post.previewUrl) && !isVideo && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [post.previewUrl]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        size ? { width: size, height: size } : styles.fallbackSize,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.mediaFallback}>
        <Ionicons
          name={isVideo ? 'play' : 'image-outline'}
          size={isVideo ? 30 : 27}
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
          <Ionicons name="videocam" size={14} color="#fff" />
        </View>
      ) : null}

      {onMenuPress ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation?.();
            onMenuPress();
          }}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Manage post"
          style={({ pressed }) => [
            styles.menuBadge,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color="#fff" />
        </Pressable>
      ) : null}

      {post.mediaCount > 1 ? (
        <View style={styles.mediaCountBadge}>
          <Ionicons name="copy-outline" size={14} color="#fff" />
          <Text style={styles.mediaCountText}>{post.mediaCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#efefef',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.bg,
    overflow: 'hidden',
  },
  fallbackSize: {
    width: '33.333333%',
    aspectRatio: 1,
  },
  pressed: {
    opacity: 0.82,
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
    fontSize: 11,
    marginTop: 3,
  },
  videoBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.66)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaCountBadge: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  mediaCountText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
});
