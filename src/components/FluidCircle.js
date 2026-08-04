import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useThemeTokens } from '../theme/ThemeProvider';

const BRAND_MOTION = {
  fluidFlowAMs: 6100,
  fluidFlowBMs: 7900,
  fluidBreathInMs: 3600,
  fluidBreathOutMs: 4200,
};

const GLASS_SURFACE = {
  surfaceGradient: [
    'rgba(255,255,255,0.78)',
    'rgba(255,255,255,0.28)',
    'rgba(255,255,255,0.58)',
  ],
  surfaceBackground: 'rgba(255,255,255,0.16)',
  lightGradient: [
    'rgba(255,255,255,0)',
    'rgba(255,255,255,0.76)',
    'rgba(255,255,255,0.10)',
    'rgba(255,255,255,0)',
  ],
};

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function deterministicUnit(row, column, salt) {
  const value = Math.sin(row * 12.9898 + column * 78.233 + salt) * 43758.5453;
  return value - Math.floor(value);
}

function createParticleGroups(size) {
  // The old surface animated every particle independently. Keeping the field
  // dense but moving three particle layers as a whole preserves the fluid read
  // while avoiding hundreds of animated interpolation graphs at app launch.
  const spacing = Math.max(9.8, size / 19.2);
  const verticalSpacing = spacing * 0.88;
  const radius = size / 2;
  const boundaryInset = spacing * 0.48;
  const groups = [[], [], []];

  let row = 0;
  for (let y = spacing * 0.5; y <= size - spacing * 0.5; y += verticalSpacing) {
    const rowOffset = row % 2 === 0 ? 0 : spacing * 0.5;
    let column = 0;

    for (let x = spacing * 0.5 + rowOffset; x <= size - spacing * 0.5; x += spacing) {
      const jitterX = (deterministicUnit(row, column, 1.7) - 0.5) * spacing * 0.18;
      const jitterY = (deterministicUnit(row, column, 4.1) - 0.5) * spacing * 0.18;
      const resolvedX = x + jitterX;
      const resolvedY = y + jitterY;
      const centerDistance = Math.hypot(resolvedX - radius, resolvedY - radius);

      if (centerDistance <= radius - boundaryInset) {
        const radialPosition = clamp(centerDistance / radius, 0, 1);
        const depth = 0.72 + deterministicUnit(row, column, 8.3) * 0.28;
        const particleSize = clamp(size * 0.0071, 1.15, 1.65) * (0.86 + depth * 0.18);
        groups[(row + column) % groups.length].push({
          id: `${row}-${column}`,
          left: resolvedX - particleSize / 2,
          top: resolvedY - particleSize / 2,
          size: particleSize,
          opacity: 0.52 - radialPosition * 0.18 + deterministicUnit(row, column, 3.2) * 0.08,
        });
      }

      column += 1;
    }

    row += 1;
  }

  return groups;
}

export function FluidCircle({
  size = 220,
  pressScale,
  expansionScale,
  rippleProgress,
  rippleOrigin,
}) {
  const theme = useThemeTokens();
  const flowA = useRef(new Animated.Value(0)).current;
  const flowB = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const particleGroups = useMemo(() => createParticleGroups(size), [size]);

  useEffect(() => {
    if (reducedMotion) {
      flowA.stopAnimation();
      flowB.stopAnimation();
      breath.stopAnimation();
      return undefined;
    }

    const flowALoop = Animated.loop(
      Animated.sequence([
        Animated.timing(flowA, {
          toValue: 1,
          duration: BRAND_MOTION.fluidFlowAMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(flowA, {
          toValue: 0,
          duration: BRAND_MOTION.fluidFlowAMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const flowBLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(flowB, {
          toValue: 1,
          duration: BRAND_MOTION.fluidFlowBMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(flowB, {
          toValue: 0,
          duration: BRAND_MOTION.fluidFlowBMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: BRAND_MOTION.fluidBreathInMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: BRAND_MOTION.fluidBreathOutMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    flowALoop.start();
    flowBLoop.start();
    breathLoop.start();

    return () => {
      flowALoop.stop();
      flowBLoop.stop();
      breathLoop.stop();
    };
  }, [breath, flowA, flowB, reducedMotion]);

  const resolvedPressScale = pressScale || 1;
  const resolvedExpansionScale = expansionScale || 1;
  const origin = rippleOrigin || { x: size / 2, y: size / 2 };
  const activeRipple = rippleProgress && !reducedMotion ? rippleProgress : null;
  const radius = size / 2;

  const animatedSurfaceStyle = {
    transform: [
      {
        scaleX: breath.interpolate({ inputRange: [0, 1], outputRange: [0.996, 1.006] }),
      },
      {
        scaleY: breath.interpolate({ inputRange: [0, 1], outputRange: [1.006, 0.996] }),
      },
    ],
  };

  const groupStyles = [
    {
      opacity: flowB.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }),
      transform: [
        { translateX: flowA.interpolate({ inputRange: [0, 1], outputRange: [-1.2, 1.4] }) },
        { translateY: flowB.interpolate({ inputRange: [0, 1], outputRange: [1.1, -1.25] }) },
        { scale: flowA.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1.012] }) },
      ],
    },
    {
      opacity: flowA.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }),
      transform: [
        { translateX: flowB.interpolate({ inputRange: [0, 1], outputRange: [1.35, -1.05] }) },
        { translateY: flowA.interpolate({ inputRange: [0, 1], outputRange: [-0.8, 1.15] }) },
        { scale: flowB.interpolate({ inputRange: [0, 1], outputRange: [1.01, 0.992] }) },
      ],
    },
    {
      opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
      transform: [
        { translateX: flowA.interpolate({ inputRange: [0, 1], outputRange: [0.8, -1.0] }) },
        { translateY: flowB.interpolate({ inputRange: [0, 1], outputRange: [-1.2, 0.75] }) },
        { scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.994, 1.008] }) },
      ],
    },
  ];

  const lightDriftStyle = {
    opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.36] }),
    transform: [
      { translateX: flowA.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.045, size * 0.045] }) },
      { translateY: flowB.interpolate({ inputRange: [0, 1], outputRange: [size * 0.02, -size * 0.02] }) },
    ],
  };

  const boundaryRippleStyle = activeRipple
    ? {
        opacity: activeRipple.interpolate({
          inputRange: [0, 0.6, 0.8, 1],
          outputRange: [0, 0, 0.42, 0],
          extrapolate: 'clamp',
        }),
        transform: [
          {
            scale: activeRipple.interpolate({
              inputRange: [0, 0.6, 0.84, 1],
              outputRange: [0.99, 0.99, 1.013, 1.027],
              extrapolate: 'clamp',
            }),
          },
        ],
      }
    : null;

  const tapRippleStyle = activeRipple
    ? {
        left: origin.x - size * 0.055,
        top: origin.y - size * 0.055,
        width: size * 0.11,
        height: size * 0.11,
        borderRadius: size * 0.055,
        opacity: activeRipple.interpolate({
          inputRange: [0, 0.12, 0.72, 1],
          outputRange: [0, 0.48, 0.2, 0],
          extrapolate: 'clamp',
        }),
        transform: [
          {
            scale: activeRipple.interpolate({
              inputRange: [0, 1],
              outputRange: [0.35, 9.4],
              extrapolate: 'clamp',
            }),
          },
        ],
      }
    : null;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          width: size,
          height: size,
          borderRadius: radius,
          transform: [
            { scale: resolvedPressScale },
            { scale: resolvedExpansionScale },
          ],
        },
      ]}
    >
      <Animated.View
        style={[
          styles.surface,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: GLASS_SURFACE.surfaceBackground,
            shadowColor: theme.fluid.shadow,
          },
          animatedSurfaceStyle,
        ]}
      >
        <LinearGradient
          colors={GLASS_SURFACE.surfaceGradient}
          locations={[0, 0.52, 1]}
          start={{ x: 0.12, y: 0.03 }}
          end={{ x: 0.9, y: 0.98 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.lightDrift,
            {
              width: size * 0.78,
              height: size * 0.28,
              left: size * 0.08,
              top: size * 0.23,
              borderRadius: size * 0.18,
            },
            lightDriftStyle,
          ]}
        >
          <LinearGradient
            colors={GLASS_SURFACE.lightGradient}
            locations={[0, 0.38, 0.67, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {particleGroups.map((particles, groupIndex) => (
          <Animated.View
            key={`particle-group-${groupIndex}`}
            pointerEvents="none"
            style={[styles.particleField, groupStyles[groupIndex]]}
          >
            {particles.map((particle) => (
              <View
                key={particle.id}
                style={[
                  styles.particle,
                  {
                    left: particle.left,
                    top: particle.top,
                    width: particle.size,
                    height: particle.size,
                    borderRadius: particle.size / 2,
                    opacity: particle.opacity,
                    backgroundColor: theme.fluid.particle,
                  },
                ]}
              />
            ))}
          </Animated.View>
        ))}

        {tapRippleStyle ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tapRipple,
              { borderColor: theme.fluid.particle },
              tapRippleStyle,
            ]}
          />
        ) : null}

        <View
          style={[
            styles.edge,
            {
              borderRadius: radius,
              borderWidth: Math.max(1.6, size * 0.0074),
              borderColor: theme.welcome.brandInk,
            },
          ]}
        />

        {boundaryRippleStyle ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.boundaryRipple,
              {
                borderRadius: radius,
                borderWidth: Math.max(1, size * 0.006),
                borderColor: theme.fluid.boundaryRipple,
              },
              boundaryRippleStyle,
            ]}
          />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  surface: {
    overflow: 'hidden',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  lightDrift: {
    position: 'absolute',
    overflow: 'hidden',
  },
  particleField: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
  },
  tapRipple: {
    position: 'absolute',
    borderWidth: 1.1,
  },
  edge: {
    ...StyleSheet.absoluteFillObject,
  },
  boundaryRipple: {
    ...StyleSheet.absoluteFillObject,
  },
});
