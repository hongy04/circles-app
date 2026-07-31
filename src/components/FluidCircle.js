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

const WAVE_INPUT_RANGE = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const TWO_PI = Math.PI * 2;

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
      (enabled) => {
        setReducedMotion(!!enabled);
      }
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

function createParticleGrid(size) {
  // Dense enough to read as a continuous material, but still light enough for
  // the native animation driver to move smoothly on a phone.
  const spacing = Math.max(7.6, size / 24.5);
  const verticalSpacing = spacing * 0.86;
  const radius = size / 2;
  const boundaryInset = spacing * 0.4;
  const particles = [];

  let row = 0;
  for (let y = spacing * 0.45; y <= size - spacing * 0.45; y += verticalSpacing) {
    const rowOffset = row % 2 === 0 ? 0 : spacing * 0.5;
    let column = 0;

    for (
      let x = spacing * 0.45 + rowOffset;
      x <= size - spacing * 0.45;
      x += spacing
    ) {
      const jitterX = (deterministicUnit(row, column, 1.7) - 0.5) * spacing * 0.14;
      const jitterY = (deterministicUnit(row, column, 4.1) - 0.5) * spacing * 0.14;
      const resolvedX = x + jitterX;
      const resolvedY = y + jitterY;
      const centerDistance = Math.hypot(resolvedX - radius, resolvedY - radius);

      if (centerDistance <= radius - boundaryInset) {
        const depth = 0.72 + deterministicUnit(row, column, 8.3) * 0.28;
        particles.push({
          id: `${row}-${column}`,
          x: resolvedX,
          y: resolvedY,
          centerDistance,
          depth,
          phaseA:
            (resolvedX / size) * TWO_PI +
            (resolvedY / size) * Math.PI * 1.15 +
            deterministicUnit(row, column, 2.6) * 0.42,
          phaseB:
            (resolvedY / size) * TWO_PI -
            (resolvedX / size) * Math.PI * 0.82 +
            1.2 +
            deterministicUnit(row, column, 6.4) * 0.38,
        });
      }

      column += 1;
    }

    row += 1;
  }

  return particles;
}

function sineOutputRange(phase, amplitude, center = 0) {
  return WAVE_INPUT_RANGE.map(
    (progress) => center + Math.sin(phase + progress * TWO_PI) * amplitude
  );
}

function createIdleParticleAnimation({
  particle,
  size,
  flowA,
  flowB,
  baseOpacity,
}) {
  const depth = particle.depth;
  const xAmplitude = clamp(size * 0.0034 * depth, 0.45, 0.92);
  const yAmplitude = clamp(size * 0.0042 * depth, 0.55, 1.08);
  const scaleAmplitude = 0.065 + depth * 0.035;
  const opacityAmplitude = 0.055 + depth * 0.035;

  return {
    opacity: flowB.interpolate({
      inputRange: WAVE_INPUT_RANGE,
      outputRange: sineOutputRange(
        particle.phaseB + 0.6,
        opacityAmplitude,
        baseOpacity
      ),
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateX: flowA.interpolate({
          inputRange: WAVE_INPUT_RANGE,
          outputRange: sineOutputRange(particle.phaseA, xAmplitude),
          extrapolate: 'clamp',
        }),
      },
      {
        translateY: flowB.interpolate({
          inputRange: WAVE_INPUT_RANGE,
          outputRange: sineOutputRange(particle.phaseB, yAmplitude),
          extrapolate: 'clamp',
        }),
      },
      {
        scale: flowA.interpolate({
          inputRange: WAVE_INPUT_RANGE,
          outputRange: sineOutputRange(
            particle.phaseA + particle.phaseB * 0.28,
            scaleAmplitude,
            1
          ),
          extrapolate: 'clamp',
        }),
      },
    ],
  };
}

function createTapRippleAnimation({ particle, origin, size, rippleProgress }) {
  const dx = particle.x - origin.x;
  const dy = particle.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const safeDistance = Math.max(distance, 1);
  const directionX = dx / safeDistance;
  const directionY = dy / safeDistance;
  const maxDistance = Math.max(size * 0.92, 1);
  const normalizedDistance = clamp(distance / maxDistance, 0, 1);
  const arrival = 0.09 + normalizedDistance * 0.58;
  const preWave = Math.max(0, arrival - 0.075);
  const depression = arrival - 0.022;
  const crest = arrival + 0.038;
  const rebound = arrival + 0.105;
  const settled = Math.min(0.96, arrival + 0.22);
  const inputRange = [0, preWave, depression, crest, rebound, settled, 1];
  const distanceDamping = 1 - normalizedDistance * 0.34;
  const displacement = clamp(size * 0.009, 1.25, 2.05) * distanceDamping;

  return {
    opacityFactor: rippleProgress.interpolate({
      inputRange,
      outputRange: [1, 1, 0.84, 1.22, 1.06, 1, 1],
      extrapolate: 'clamp',
    }),
    transforms: [
      {
        translateX: rippleProgress.interpolate({
          inputRange,
          outputRange: [
            0,
            0,
            -directionX * displacement * 0.22,
            directionX * displacement,
            -directionX * displacement * 0.2,
            0,
            0,
          ],
          extrapolate: 'clamp',
        }),
      },
      {
        translateY: rippleProgress.interpolate({
          inputRange,
          outputRange: [
            0,
            0,
            -directionY * displacement * 0.22,
            directionY * displacement,
            -directionY * displacement * 0.2,
            0,
            0,
          ],
          extrapolate: 'clamp',
        }),
      },
      {
        scale: rippleProgress.interpolate({
          inputRange,
          outputRange: [1, 1, 0.9, 1.24, 0.97, 1, 1],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
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
  const particles = useMemo(() => createParticleGrid(size), [size]);

  useEffect(() => {
    if (reducedMotion) {
      flowA.stopAnimation();
      flowB.stopAnimation();
      breath.stopAnimation();
      return undefined;
    }

    const flowALoop = Animated.loop(
      Animated.timing(flowA, {
        toValue: 1,
        duration: theme.motion.fluidFlowAMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const flowBLoop = Animated.loop(
      Animated.timing(flowB, {
        toValue: 1,
        duration: theme.motion.fluidFlowBMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: theme.motion.fluidBreathInMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: theme.motion.fluidBreathOutMs,
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
  }, [breath, flowA, flowB, reducedMotion, theme.motion]);

  const resolvedPressScale = pressScale || 1;
  const resolvedExpansionScale = expansionScale || 1;
  const origin = rippleOrigin || { x: size / 2, y: size / 2 };
  const activeRipple = rippleProgress && !reducedMotion ? rippleProgress : null;
  const baseParticleSize = clamp(size * 0.00565, 1.02, 1.42);
  const radius = size / 2;

  const animatedSurfaceStyle = useMemo(
    () => ({
      transform: [
        {
          scaleX: breath.interpolate({
            inputRange: [0, 1],
            outputRange: [0.994, 1.008],
          }),
        },
        {
          scaleY: breath.interpolate({
            inputRange: [0, 1],
            outputRange: [1.007, 0.995],
          }),
        },
        {
          rotate: breath.interpolate({
            inputRange: [0, 1],
            outputRange: ['-0.16deg', '0.18deg'],
          }),
        },
      ],
    }),
    [breath]
  );

  const lightDriftStyle = useMemo(
    () => ({
      opacity: breath.interpolate({
        inputRange: [0, 1],
        outputRange: [0.22, 0.38],
      }),
      transform: [
        {
          translateX: flowA.interpolate({
            inputRange: [0, 1],
            outputRange: [-size * 0.08, size * 0.08],
          }),
        },
        {
          translateY: flowB.interpolate({
            inputRange: [0, 1],
            outputRange: [size * 0.035, -size * 0.035],
          }),
        },
        {
          rotate: flowA.interpolate({
            inputRange: [0, 1],
            outputRange: ['-7deg', '7deg'],
          }),
        },
      ],
    }),
    [breath, flowA, flowB, size]
  );

  const boundaryRippleStyle = activeRipple
    ? {
        opacity: activeRipple.interpolate({
          inputRange: [0, 0.62, 0.81, 1],
          outputRange: [0, 0, 0.46, 0],
          extrapolate: 'clamp',
        }),
        transform: [
          {
            scale: activeRipple.interpolate({
              inputRange: [0, 0.62, 0.82, 1],
              outputRange: [0.99, 0.99, 1.012, 1.025],
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
          },
          animatedSurfaceStyle,
          {
            backgroundColor: theme.fluid.surfaceBackground,
            shadowColor: theme.fluid.shadow,
          },
        ]}
      >
        <LinearGradient
          colors={theme.fluid.surfaceGradient}
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
            colors={theme.fluid.lightGradient}
            locations={[0, 0.38, 0.67, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.particleField}>
          {particles.map((particle) => {
            const radialPosition = clamp(particle.centerDistance / radius, 0, 1);
            const baseOpacity = 0.5 - radialPosition * 0.18;
            const particleSize = baseParticleSize * (0.84 + particle.depth * 0.2);
            const idleStyle = createIdleParticleAnimation({
              particle,
              size,
              flowA,
              flowB,
              baseOpacity,
            });
            const tapStyle = activeRipple
              ? createTapRippleAnimation({
                  particle,
                  origin,
                  size,
                  rippleProgress: activeRipple,
                })
              : null;

            return (
              <Animated.View
                key={particle.id}
                style={[
                  styles.particle,
                  {
                    left: particle.x - particleSize / 2,
                    top: particle.y - particleSize / 2,
                    width: particleSize,
                    height: particleSize,
                    borderRadius: particleSize / 2,
                    opacity: tapStyle
                      ? Animated.multiply(idleStyle.opacity, tapStyle.opacityFactor)
                      : idleStyle.opacity,
                    transform: tapStyle
                      ? [...idleStyle.transform, ...tapStyle.transforms]
                      : idleStyle.transform,
                    backgroundColor: theme.fluid.particle,
                  },
                ]}
              />
            );
          })}
        </View>

        <View
          style={[
            styles.edge,
            {
              borderRadius: radius,
              borderWidth: Math.max(1.6, size * 0.0074),
              borderColor: theme.fluid.outline,
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
    shadowOpacity: 0.2,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 9,
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
  edge: {
    ...StyleSheet.absoluteFillObject,
  },
  boundaryRipple: {
    ...StyleSheet.absoluteFillObject,
  },
});
