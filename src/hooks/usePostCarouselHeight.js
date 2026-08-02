import { useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import { mediaPresentationForIndex } from '../utils/postPresentation';

function safeIndex(index, length) {
  if (!length) return 0;
  return Math.max(0, Math.min(length - 1, Number(index) || 0));
}

export function usePostCarouselHeight({ media = [], presentation, width, activeIndex = 0 }) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const measuredWidth = Math.max(0, Number(width) || 0);
  const mediaKey = useMemo(
    () => (media || []).map((item) => item?.id || item?.url || '').join('|'),
    [media]
  );

  const heights = useMemo(() => {
    if (!measuredWidth || !media.length) return [1];
    return media.map((item, index) => {
      const itemPresentation = mediaPresentationForIndex(presentation, index, item);
      return measuredWidth / Math.max(0.01, itemPresentation.aspectRatio);
    });
  }, [media, measuredWidth, presentation]);

  useEffect(() => {
    if (!measuredWidth) return;
    scrollX.setValue(safeIndex(activeIndex, media.length) * measuredWidth);
  }, [activeIndex, mediaKey, media.length, measuredWidth, scrollX]);

  const onScroll = useMemo(
    () => Animated.event(
      [{ nativeEvent: { contentOffset: { x: scrollX } } }],
      { useNativeDriver: false }
    ),
    [scrollX]
  );

  if (!measuredWidth || !media.length) {
    return { animatedHeight: 1, onScroll, heights };
  }

  if (media.length === 1) {
    return { animatedHeight: heights[0], onScroll, heights };
  }

  const inputRange = media.map((_, index) => index * measuredWidth);
  const animatedHeight = scrollX.interpolate({
    inputRange,
    outputRange: heights,
    extrapolate: 'clamp',
  });

  return { animatedHeight, onScroll, heights };
}
