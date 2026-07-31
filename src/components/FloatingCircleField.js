import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useThemeTokens } from '../theme/ThemeProvider';

const TWO_PI = Math.PI * 2;
const MOTION_STEPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

const PORTAL_ZONES = [
  { x: [-0.15, 0.02], y: [0.08, 0.24] },
  { x: [0.76, 0.93], y: [0.04, 0.2] },
  { x: [0.85, 1.01], y: [0.28, 0.46] },
  { x: [-0.17, -0.01], y: [0.4, 0.61] },
  { x: [0.78, 0.97], y: [0.68, 0.86] },
  { x: [-0.12, 0.08], y: [0.73, 0.93] },
  { x: [0.17, 0.34], y: [0.03, 0.16] },
  { x: [0.61, 0.78], y: [0.84, 0.98] },
  { x: [0.08, 0.23], y: [0.26, 0.4] },
  { x: [0.74, 0.89], y: [0.51, 0.67] },
  { x: [0.24, 0.38], y: [0.82, 0.96] },
  { x: [0.58, 0.73], y: [0.12, 0.25] },
];

const AUTH_ZONES = [
  { x: [-0.14, 0.02], y: [0.04, 0.19] },
  { x: [0.76, 0.94], y: [0.06, 0.2] },
  { x: [0.84, 1.01], y: [0.26, 0.42] },
  { x: [-0.17, -0.01], y: [0.33, 0.51] },
  { x: [0.8, 0.97], y: [0.56, 0.72] },
  { x: [-0.12, 0.06], y: [0.69, 0.87] },
  { x: [0.63, 0.81], y: [0.82, 0.98] },
  { x: [0.13, 0.28], y: [0.15, 0.28] },
  { x: [0.69, 0.83], y: [0.39, 0.54] },
  { x: [0.2, 0.36], y: [0.88, 1.02] },
];

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(!!enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => setReducedMotion(!!enabled)
    );

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reducedMotion;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function sineRange(phase, amplitude, center = 0) {
  return MOTION_STEPS.map(
    (progress) => center + Math.sin(phase + progress * TWO_PI) * amplitude
  );
}

function createOrbs(width, height, variant, seed, palette, motion) {
  const zones = variant === 'auth' ? AUTH_ZONES : PORTAL_ZONES;
  const random = mulberry32(seed + Math.round(width * 7 + height * 11));
  const minDimension = Math.min(width, height);

  return zones.map((zone, index) => {
    const depth = 0.42 + random() * 0.58;
    const sizeRatio = variant === 'auth'
      ? 0.11 + random() * 0.15
      : 0.12 + random() * 0.19;
    const size = Math.max(
      42,
      Math.min(150, minDimension * sizeRatio * (0.82 + depth * 0.28))
    );
    const x = (zone.x[0] + random() * (zone.x[1] - zone.x[0])) * width;
    const y = (zone.y[0] + random() * (zone.y[1] - zone.y[0])) * height;
    const rgb = palette[
      (index + Math.floor(random() * palette.length)) % palette.length
    ];

    return {
      id: `${variant}-${index}`,
      x,
      y,
      size,
      depth,
      rgb,
      opacity: 0.11 + depth * 0.13 + random() * 0.04,
      driftX: (5 + depth * 12) * (random() > 0.5 ? 1 : -1),
      driftY: 7 + depth * 13,
      duration:
        motion.orbBaseDurationMs +
        Math.round(
          (1 - depth) * motion.orbDepthDurationMs +
            random() * motion.orbVarianceDurationMs
        ),
      phase: random() * TWO_PI,
      scaleAmount: 0.012 + depth * 0.018,
    };
  });
}

function FloatingOrb({ orb, reducedMotion, visualTokens }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      progress.stopAnimation();
      progress.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: orb.duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();
    return () => animation.stop();
  }, [orb.duration, progress, reducedMotion]);

  const translateX = reducedMotion
    ? 0
    : progress.interpolate({
        inputRange: MOTION_STEPS,
        outputRange: sineRange(orb.phase, orb.driftX),
      });
  const translateY = reducedMotion
    ? 0
    : progress.interpolate({
        inputRange: MOTION_STEPS,
        outputRange: sineRange(orb.phase + 1.4, orb.driftY),
      });
  const scale = reducedMotion
    ? 1
    : progress.interpolate({
        inputRange: MOTION_STEPS,
        outputRange: sineRange(orb.phase + 0.65, orb.scaleAmount, 1),
      });
  const opacity = reducedMotion
    ? orb.opacity * 0.92
    : progress.interpolate({
        inputRange: MOTION_STEPS,
        outputRange: sineRange(orb.phase + 2.1, 0.025, orb.opacity),
      });

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          left: orb.x,
          top: orb.y,
          width: orb.size,
          height: orb.size,
          borderRadius: orb.size / 2,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
          shadowColor: rgba(orb.rgb, 0.6),
          shadowOpacity: Platform.OS === 'ios' ? 0.17 : 0,
          shadowRadius: 18 + orb.depth * 14,
          shadowOffset: { width: 0, height: 8 + orb.depth * 6 },
        },
      ]}
    >
      <LinearGradient
        colors={[
          visualTokens.orbGlassTop,
          rgba(orb.rgb, 0.34),
          rgba(orb.rgb, 0.16),
        ]}
        locations={[0, 0.44, 1]}
        start={{ x: 0.12, y: 0.04 }}
        end={{ x: 0.88, y: 0.96 }}
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: orb.size / 2,
            borderWidth: Math.max(0.8, orb.size * 0.009),
            borderColor: visualTokens.orbBorder,
          },
        ]}
      />
      <View
        style={[
          styles.orbSoftCore,
          {
            width: orb.size * 0.62,
            height: orb.size * 0.62,
            borderRadius: orb.size * 0.31,
            left: orb.size * 0.23,
            top: orb.size * 0.25,
            backgroundColor: rgba(orb.rgb, visualTokens.orbCoreAlpha),
          },
        ]}
      />
      <View
        style={[
          styles.orbHighlight,
          {
            width: orb.size * 0.31,
            height: orb.size * 0.13,
            borderRadius: orb.size * 0.1,
            left: orb.size * 0.18,
            top: orb.size * 0.16,
            backgroundColor: visualTokens.orbHighlight,
          },
        ]}
      />
    </Animated.View>
  );
}

export function FloatingCircleField({ variant = 'portal' }) {
  const theme = useThemeTokens();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const seedRef = useRef(Math.floor(Math.random() * 1000000000));
  const reveal = useRef(new Animated.Value(0)).current;
  const orbs = useMemo(
    () =>
      createOrbs(
        width,
        height,
        variant,
        seedRef.current,
        theme.welcome.orbPalette,
        theme.motion
      ),
    [height, theme.motion, theme.welcome.orbPalette, variant, width]
  );

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: reducedMotion
        ? theme.motion.welcomeRevealReducedMs
        : theme.motion.welcomeRevealMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, reveal, theme.motion, variant]);

  const backgroundColors = variant === 'auth'
    ? theme.welcome.authBackground
    : theme.welcome.portalBackground;

  const visualTokens = {
    orbGlassTop: theme.welcome.orbGlassTop,
    orbBorder: theme.welcome.orbBorder,
    orbHighlight: theme.welcome.orbHighlight,
    orbCoreAlpha: 0.08,
  };

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.field, { opacity: reveal }]}
    >
      <LinearGradient
        colors={backgroundColors}
        locations={[0, 0.55, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.82, y: 1 }}
        style={StyleSheet.absoluteFill}
      />


      {orbs.map((orb) => (
        <FloatingOrb
          key={orb.id}
          orb={orb}
          reducedMotion={reducedMotion}
          visualTokens={visualTokens}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  field: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    overflow: 'hidden',
  },
  orbSoftCore: {
    position: 'absolute',
  },
  orbHighlight: {
    position: 'absolute',
    transform: [{ rotate: '-18deg' }],
  },
});
