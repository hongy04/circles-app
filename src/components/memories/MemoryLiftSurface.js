import React, { memo } from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  measure,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';

/**
 * A small scrapbook-style depth cue for memory cards.
 *
 * `scrollY` is intentionally a Reanimated shared value. Card measurement and
 * interpolation stay on the UI thread, so scrolling does not set React state
 * or rerender the list on every frame.
 */
function MemoryLiftSurfaceBase({
  scrollY,
  children,
  style,
  focusRatio = 0.54,
  minScale = 0.972,
  maxScale = 1.018,
  lift = 7,
  enabled = true,
}) {
  const animatedRef = useAnimatedRef();
  const progress = useSharedValue(enabled ? 0.45 : 1);
  const layoutVersion = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();

  useAnimatedReaction(
    () => [scrollY ? scrollY.value : 0, layoutVersion.value],
    () => {
      if (!enabled || reduceMotion) {
        progress.value = 1;
        return;
      }

      const layout = measure(animatedRef);
      if (!layout) return;

      const cardCenter = layout.pageY + (layout.height / 2);
      const focusY = windowHeight * focusRatio;
      const distance = Math.abs(cardCenter - focusY);
      const falloff = Math.max(260, windowHeight * 0.46);

      progress.value = interpolate(
        distance,
        [0, falloff],
        [1, 0],
        Extrapolation.CLAMP
      );
    },
    [enabled, focusRatio, reduceMotion, windowHeight]
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (!enabled || reduceMotion) {
      return {
        opacity: 1,
        transform: [
          { translateY: 0 },
          { scaleX: 1 },
          { scaleY: 1 },
        ],
      };
    }

    const focus = progress.value;
    const scale = interpolate(
      focus,
      [0, 1],
      [minScale, maxScale],
      Extrapolation.CLAMP
    );

    return {
      opacity: interpolate(focus, [0, 1], [0.9, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(
            focus,
            [0, 1],
            [5, -Math.abs(lift)],
            Extrapolation.CLAMP
          ),
        },
        {
          // A tiny extra vertical opening makes the focused memory feel less
          // compressed without creating a dramatic carousel-style zoom.
          scaleY: interpolate(
            focus,
            [0, 1],
            [Math.max(0.96, minScale - 0.002), maxScale + 0.004],
            Extrapolation.CLAMP
          ),
        },
        { scaleX: scale },
      ],
    };
  }, [enabled, lift, maxScale, minScale, reduceMotion]);

  return (
    <Animated.View
      ref={animatedRef}
      collapsable={false}
      onLayout={() => {
        layoutVersion.value += 1;
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </Animated.View>
  );
}

export const MemoryLiftSurface = memo(MemoryLiftSurfaceBase);
