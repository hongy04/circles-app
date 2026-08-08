import React, { memo, useEffect, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { getInitials } from '../../utils/getInitials';
import { WHISPER_MAX_HEADER_BUBBLES } from '../../services/whisperService';

const HEADER_ACTION_SAFE_RIGHT = 66;

const PHOTO_BUBBLE_LAYOUT_WITH_HEADER = [
  { size: 58, right: 20, top: 12, depth: 1 },
  { size: 47, right: 86, top: 54, depth: 0.86 },
  { size: 39, right: 144, top: 13, depth: 0.72 },
];

const PHOTO_BUBBLE_LAYOUT_NO_HEADER = [
  { size: 47, left: 73, top: -3, depth: 1 },
  { size: 38, left: 8, top: 48, depth: 0.83 },
  { size: 33, left: 86, top: 57, depth: 0.7 },
];

function hashString(value = '') {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function BubblePhoto({ whisper, size }) {
  const initials = getInitials(whisper.senderName || 'Connection');
  const avatarUri = whisper.senderAvatar;

  return (
    <View style={[styles.shell, { width: size, height: size, borderRadius: size / 2 }]}> 
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.88)',
          'rgba(159,227,255,0.48)',
          'rgba(226,187,255,0.34)',
          'rgba(255,255,255,0.72)',
        ]}
        start={{ x: 0.06, y: 0.05 }}
        end={{ x: 0.94, y: 0.94 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />

      <View
        style={[
          styles.photoLens,
          {
            left: 2.4,
            top: 2.4,
            width: size - 4.8,
            height: size - 4.8,
            borderRadius: (size - 4.8) / 2,
          },
        ]}
      >
        {avatarUri ? (
          <>
            <Image
              source={{ uri: avatarUri }}
              resizeMode="cover"
              style={[
                styles.avatarImage,
                {
                  width: size * 1.14,
                  height: size * 1.14,
                  left: -size * 0.07,
                  top: -size * 0.07,
                  transform: [
                    { scaleX: 1.035 },
                    { scaleY: 1.08 },
                  ],
                },
              ]}
            />
            <Image
              source={{ uri: avatarUri }}
              resizeMode="cover"
              style={[
                styles.avatarImage,
                styles.refractedAvatar,
                {
                  width: size * 1.18,
                  height: size * 1.18,
                  left: -size * 0.045,
                  top: -size * 0.09,
                  transform: [
                    { translateX: size * 0.025 },
                    { scaleX: 1.08 },
                    { scaleY: 1.03 },
                  ],
                },
              ]}
            />
          </>
        ) : (
          <View style={styles.initialsFill}>
            <Text style={[styles.initials, { fontSize: Math.max(11, size * 0.27) }]}>
              {initials}
            </Text>
          </View>
        )}

        <LinearGradient
          colors={[
            'rgba(255,255,255,0.34)',
            'rgba(255,255,255,0.03)',
            'rgba(116,207,255,0.08)',
            'rgba(242,174,255,0.16)',
          ]}
          locations={[0, 0.34, 0.7, 1]}
          start={{ x: 0.13, y: 0.02 }}
          end={{ x: 0.88, y: 0.96 }}
          style={StyleSheet.absoluteFill}
        />

        <View
          style={[
            styles.lensEdge,
            {
              borderRadius: size / 2,
              borderWidth: Math.max(0.7, size * 0.018),
            },
          ]}
        />
      </View>

      <View
        style={[
          styles.highlightArc,
          {
            left: size * 0.19,
            top: size * 0.13,
            width: size * 0.38,
            height: size * 0.21,
            borderRadius: size * 0.22,
            borderTopWidth: Math.max(1.1, size * 0.027),
            borderLeftWidth: Math.max(0.7, size * 0.016),
          },
        ]}
      />
      <View
        style={[
          styles.highlightDot,
          {
            width: Math.max(3.2, size * 0.09),
            height: Math.max(3.2, size * 0.09),
            borderRadius: size,
            right: size * 0.2,
            bottom: size * 0.16,
          },
        ]}
      />
      <View
        style={[
          styles.chromaticEdge,
          {
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: size,
            right: -size * 0.05,
            bottom: -size * 0.07,
          },
        ]}
      />
    </View>
  );
}

function FloatingPhotoBubble({ whisper, index, layout, topInset = 0, hasHeaderPhoto }) {
  const reduceMotion = useReducedMotion();
  const floatProgress = useSharedValue(0);
  const appearProgress = useSharedValue(reduceMotion ? 1 : 0);
  const seed = useMemo(() => hashString(`${whisper.id}:${whisper.senderId}:${index}`), [index, whisper.id, whisper.senderId]);

  const floatX = 2.2 + (seed % 23) / 10;
  const floatY = 3.2 + ((seed >>> 5) % 29) / 10;
  const rotate = 0.7 + ((seed >>> 9) % 17) / 10;
  const duration = 4700 + ((seed >>> 13) % 2200);
  const delay = index * 190 + ((seed >>> 17) % 180);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(floatProgress);
      floatProgress.value = 0.5;
      appearProgress.value = 1;
      return undefined;
    }

    appearProgress.value = withTiming(1, {
      duration: 440,
      easing: Easing.out(Easing.cubic),
    });
    floatProgress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      )
    );

    return () => {
      cancelAnimation(floatProgress);
      cancelAnimation(appearProgress);
    };
  }, [appearProgress, delay, duration, floatProgress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const x = reduceMotion
      ? 0
      : interpolate(floatProgress.value, [0, 1], [-floatX, floatX]);
    const y = reduceMotion
      ? 0
      : interpolate(floatProgress.value, [0, 1], [floatY, -floatY]);
    const rotation = reduceMotion
      ? 0
      : interpolate(floatProgress.value, [0, 1], [-rotate, rotate]);
    const arrivalScale = interpolate(appearProgress.value, [0, 1], [0.78, 1]);

    return {
      opacity: appearProgress.value * (layout.depth ?? 1),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${rotation}deg` },
        { scale: arrivalScale },
      ],
    };
  }, [floatX, floatY, layout.depth, reduceMotion, rotate]);

  const positionStyle = hasHeaderPhoto
    ? {
        right: layout.right,
        top: topInset + layout.top,
      }
    : {
        left: layout.left,
        top: layout.top,
      };

  return (
    <Animated.View
      style={[
        styles.floatingBubble,
        positionStyle,
        {
          width: layout.size,
          height: layout.size,
        },
        animatedStyle,
      ]}
    >
      <BubblePhoto whisper={whisper} size={layout.size} />
    </Animated.View>
  );
}

function OverflowBubble({ count, hasHeaderPhoto, topInset = 0 }) {
  if (count <= 0) return null;

  const size = hasHeaderPhoto ? 32 : 27;
  const positionStyle = hasHeaderPhoto
    ? { right: 14, top: topInset + 81 }
    : { left: 54, top: 65 };

  return (
    <View
      style={[
        styles.overflowBubble,
        positionStyle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.9)', 'rgba(181,229,255,0.66)', 'rgba(232,206,255,0.58)']}
        start={{ x: 0.12, y: 0.06 }}
        end={{ x: 0.9, y: 0.96 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
      <Text style={[styles.overflowText, { fontSize: size < 30 ? 9.5 : 10.5 }]}>+{count}</Text>
      <View style={[styles.overflowShine, { width: size * 0.28, height: size * 0.12, borderRadius: size }]} />
    </View>
  );
}

function WhisperBubbleFieldBase({ whispers = [], hasHeaderPhoto = false, topInset = 0 }) {
  const active = Array.isArray(whispers) ? whispers.filter(Boolean) : [];
  if (active.length === 0) return null;

  const visible = active.slice(0, WHISPER_MAX_HEADER_BUBBLES);
  const overflowCount = Math.max(0, active.length - visible.length);
  const layout = hasHeaderPhoto
    ? PHOTO_BUBBLE_LAYOUT_WITH_HEADER
    : PHOTO_BUBBLE_LAYOUT_NO_HEADER;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.field,
        hasHeaderPhoto
          ? { left: -18, right: HEADER_ACTION_SAFE_RIGHT, top: 0, height: 104 + topInset }
          : { left: 0, right: 0, top: 0, height: 94 },
      ]}
    >
      {visible.map((whisper, index) => (
        <FloatingPhotoBubble
          key={whisper.id}
          whisper={whisper}
          index={index}
          layout={layout[index]}
          topInset={topInset}
          hasHeaderPhoto={hasHeaderPhoto}
        />
      ))}
      <OverflowBubble
        count={overflowCount}
        hasHeaderPhoto={hasHeaderPhoto}
        topInset={topInset}
      />
    </View>
  );
}

export const WhisperBubbleField = memo(WhisperBubbleFieldBase);

const styles = StyleSheet.create({
  field: {
    position: 'absolute',
    zIndex: 6,
  },
  floatingBubble: {
    position: 'absolute',
    zIndex: 2,
  },
  shell: {
    overflow: 'visible',
    shadowColor: '#5B7E9A',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  photoLens: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: 'rgba(228,240,249,0.82)',
  },
  avatarImage: {
    position: 'absolute',
  },
  refractedAvatar: {
    opacity: 0.19,
  },
  initialsFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(219,235,245,0.96)',
  },
  initials: {
    color: 'rgba(34,51,66,0.78)',
    fontFamily: 'Manrope_700Bold',
  },
  lensEdge: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(255,255,255,0.62)',
  },
  highlightArc: {
    position: 'absolute',
    borderColor: 'rgba(255,255,255,0.9)',
    borderRightWidth: 0,
    borderBottomWidth: 0,
    transform: [{ rotate: '-19deg' }],
    opacity: 0.92,
  },
  highlightDot: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.64)',
    opacity: 0.84,
  },
  chromaticEdge: {
    position: 'absolute',
    borderWidth: 1.1,
    borderColor: 'rgba(181,160,255,0.28)',
    borderLeftColor: 'rgba(123,224,255,0.28)',
    borderTopColor: 'transparent',
    opacity: 0.88,
  },
  overflowBubble: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: '#7794AA',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  overflowText: {
    color: 'rgba(39,59,76,0.82)',
    fontFamily: 'Manrope_700Bold',
    zIndex: 2,
  },
  overflowShine: {
    position: 'absolute',
    left: '18%',
    top: '16%',
    backgroundColor: 'rgba(255,255,255,0.72)',
    transform: [{ rotate: '-18deg' }],
  },
});
