import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Video } from 'expo-av';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../../theme/colors';

function FeedVideo({ item, shouldPlay, muted }) {
  return (
    <Video
      source={{ uri: item.url }}
      style={styles.media}
      resizeMode="cover"
      shouldPlay={shouldPlay}
      isLooping
      isMuted={muted}
      useNativeControls={false}
    />
  );
}

export function PostMediaCarousel({
  media,
  liked,
  isVisible,
  onOpenPost,
  onDoubleLike,
}) {
  const [containerWidth, setContainerWidth] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [showBigHeart, setShowBigHeart] = useState(false);

  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef(null);
  const heartTimerRef = useRef(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [media?.[0]?.id]);

  useEffect(
    () => () => {
      clearTimeout(singleTapTimerRef.current);
      clearTimeout(heartTimerRef.current);
    },
    []
  );

  const items = media?.length ? media : [];

  const handleMediaPress = () => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;

    if (isDoubleTap) {
      clearTimeout(singleTapTimerRef.current);
      setShowBigHeart(true);

      if (!liked) onDoubleLike?.();

      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium
      ).catch(() => {});

      clearTimeout(heartTimerRef.current);
      heartTimerRef.current = setTimeout(
        () => setShowBigHeart(false),
        650
      );

      lastTapRef.current = 0;
      return;
    }

    lastTapRef.current = now;
    clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      onOpenPost?.();
      lastTapRef.current = 0;
    }, 310);
  };

  if (!items.length) {
    return (
      <View style={styles.emptyMedia}>
        <Ionicons
          name="image-outline"
          size={34}
          color={COLORS.subtext}
        />
        <Text style={styles.emptyText}>Media unavailable</Text>
      </View>
    );
  }

  const activeItem = items[activeIndex];

  return (
    <View
      style={styles.root}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        if (width > 0 && width !== containerWidth) {
          setContainerWidth(width);
        }
      }}
    >
      <FlatList
        horizontal
        pagingEnabled
        data={items}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        bounces={items.length > 1}
        scrollEnabled={items.length > 1}
        decelerationRate="fast"
        snapToInterval={containerWidth}
        getItemLayout={(_, index) => ({
          length: containerWidth,
          offset: containerWidth * index,
          index,
        })}
        onMomentumScrollEnd={(event) => {
          const offset = event.nativeEvent.contentOffset.x || 0;
          const nextIndex = Math.round(offset / containerWidth);
          setActiveIndex(
            Math.max(0, Math.min(items.length - 1, nextIndex))
          );
        }}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={handleMediaPress}
            style={[styles.slide, { width: containerWidth }]}
          >
            {item.media_type === 'video' ? (
              <FeedVideo
                item={item}
                muted={muted}
                shouldPlay={Boolean(
                  isVisible && activeIndex === index
                )}
              />
            ) : (
              <Image
                source={{ uri: item.url }}
                style={styles.media}
                resizeMode="cover"
              />
            )}
          </Pressable>
        )}
      />

      {items.length > 1 ? (
        <View style={styles.pageBadge} pointerEvents="none">
          <Text style={styles.pageBadgeText}>
            {activeIndex + 1}/{items.length}
          </Text>
        </View>
      ) : null}

      {activeItem?.media_type === 'video' ? (
        <Pressable
          onPress={() => setMuted((current) => !current)}
          hitSlop={8}
          style={styles.muteButton}
        >
          <Ionicons
            name={muted ? 'volume-mute' : 'volume-high'}
            size={18}
            color="#fff"
          />
        </Pressable>
      ) : null}

      {showBigHeart ? (
        <View style={styles.heartOverlay} pointerEvents="none">
          <MotiView
            from={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1.1, opacity: 1 }}
            transition={{ type: 'timing', duration: 350 }}
          >
            <Ionicons
              name="heart"
              size={96}
              color="#fff"
              style={styles.largeHeart}
            />
          </MotiView>
        </View>
      ) : null}

      {items.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {items.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.dot,
                index === activeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    backgroundColor: '#111',
  },
  slide: {
    height: '100%',
    backgroundColor: '#111',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  emptyMedia: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f2',
  },
  emptyText: {
    marginTop: 8,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  pageBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  pageBadgeText: {
    color: '#fff',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  muteButton: {
    position: 'absolute',
    right: 12,
    bottom: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeHeart: {
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  dotActive: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
});
