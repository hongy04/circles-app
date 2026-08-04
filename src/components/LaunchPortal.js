import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FluidCircle } from './FluidCircle';
import { FloatingCircleField } from './FloatingCircleField';
import { useThemeTokens } from '../theme/ThemeProvider';

const BRAND_MOTION = {
  tapRippleMs: 840,
  portalCopyFadeMs: 180,
  portalCircleFadeMs: 250,
  portalBackdropDelayMs: 170,
  portalBackdropFadeMs: 560,
  portalOverlayFadeMs: 90,
  portalReducedFadeMs: 240,
};

const RIPPLE_SPECS = [
  // The sequence deliberately behaves like a chain reaction rather than one
  // shared zoom. Each ripple owns its own origin, timing and expansion.
  { kind: 'ring', palette: 0, ratio: 0.23, x: 0.50, y: 0.50, scale: 2.75, delayMs: 0, durationMs: 620, driftX: -0.005, driftY: -0.012 },
  { kind: 'ring', palette: 1, ratio: 0.18, x: 0.38, y: 0.43, scale: 2.55, delayMs: 92, durationMs: 600, driftX: -0.018, driftY: -0.012 },
  { kind: 'glass', palette: 2, ratio: 0.15, x: 0.61, y: 0.56, scale: 2.35, delayMs: 152, durationMs: 560, driftX: 0.018, driftY: 0.014 },
  { kind: 'ring', palette: 3, ratio: 0.20, x: 0.66, y: 0.37, scale: 2.65, delayMs: 218, durationMs: 610, driftX: 0.022, driftY: -0.020 },
  { kind: 'ring', palette: 0, ratio: 0.17, x: 0.31, y: 0.62, scale: 2.85, delayMs: 284, durationMs: 630, driftX: -0.025, driftY: 0.024 },
  { kind: 'disc', palette: 4, ratio: 0.13, x: 0.51, y: 0.27, scale: 2.45, delayMs: 342, durationMs: 540, driftX: 0.004, driftY: -0.026 },
  { kind: 'ring', palette: 2, ratio: 0.15, x: 0.77, y: 0.58, scale: 2.95, delayMs: 402, durationMs: 600, driftX: 0.032, driftY: 0.012 },
  { kind: 'glass', palette: 1, ratio: 0.12, x: 0.20, y: 0.43, scale: 2.55, delayMs: 458, durationMs: 560, driftX: -0.030, driftY: -0.004 },
];

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(77,185,229,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function PortalRipple({ spec, index, progress, width, height, palette }) {
  const minDimension = Math.min(width, height);
  const size = Math.max(72, Math.min(190, minDimension * spec.ratio));
  const color = palette[spec.palette % palette.length] || '#4DB9E5';
  const isRing = spec.kind === 'ring';

  const opacity = progress.interpolate({
    inputRange: [0, 0.08, 0.34, 0.72, 1],
    outputRange: isRing
      ? [0, 0.74, 0.54, 0.24, 0]
      : [0, 0.52, 0.40, 0.16, 0],
    extrapolate: 'clamp',
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.12, 0.72, 1],
    outputRange: [0.26, 0.48, spec.scale * 0.86, spec.scale],
    extrapolate: 'clamp',
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, spec.driftX * width],
    extrapolate: 'clamp',
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, spec.driftY * height],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        styles.rippleCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          left: spec.x * width - size / 2,
          top: spec.y * height - size / 2,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    >
      {isRing ? (
        <>
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: size / 2,
                borderWidth: Math.max(3, size * 0.055),
                borderColor: rgba(color, index % 2 === 0 ? 0.30 : 0.24),
                backgroundColor: rgba(color, 0.015),
              },
            ]}
          />
          <View
            style={[
              styles.rippleEcho,
              {
                borderRadius: size / 2,
                borderColor: rgba(color, 0.13),
              },
            ]}
          />
        </>
      ) : (
        <LinearGradient
          colors={spec.kind === 'glass'
            ? [
                'rgba(255,255,255,0.48)',
                rgba(color, 0.19),
                rgba(color, 0.055),
              ]
            : [
                rgba(color, 0.28),
                rgba(color, 0.11),
                'rgba(255,255,255,0.025)',
              ]}
          locations={[0, 0.58, 1]}
          start={{ x: 0.12, y: 0.08 }}
          end={{ x: 0.88, y: 0.94 }}
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size / 2,
              borderWidth: Math.max(1, size * 0.008),
              borderColor: spec.kind === 'glass'
                ? 'rgba(255,255,255,0.52)'
                : rgba(color, 0.09),
            },
          ]}
        />
      )}

      {!isRing ? (
        <View
          style={[
            styles.rippleHighlight,
            {
              width: size * 0.30,
              height: size * 0.09,
              borderRadius: size * 0.07,
              left: size * 0.18,
              top: size * 0.16,
            },
          ]}
        />
      ) : null}
    </Animated.View>
  );
}

function PortalRippleField({ progresses, width, height, palette }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.rippleLayer}
    >
      {RIPPLE_SPECS.map((spec, index) => (
        <PortalRipple
          key={`portal-ripple-${index}`}
          spec={spec}
          index={index}
          progress={progresses[index]}
          width={width}
          height={height}
          palette={palette}
        />
      ))}
    </View>
  );
}

export function LaunchPortal({ onComplete, ready = true }) {
  const theme = useThemeTokens();
  const { width, height } = useWindowDimensions();
  const circleSize = Math.min(230, Math.max(176, width * 0.56));
  const pressScale = useRef(new Animated.Value(1)).current;
  const rippleProgress = useRef(new Animated.Value(0)).current;
  const portalRippleProgresses = useRef(
    RIPPLE_SPECS.map(() => new Animated.Value(0))
  ).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;
  const circleOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const [rippleOrigin, setRippleOrigin] = useState({
    x: circleSize / 2,
    y: circleSize / 2,
  });
  const [entering, setEntering] = useState(false);
  const reducedMotionRef = useRef(false);
  const completionRef = useRef(false);

  const ripplePalette = useMemo(() => {
    const palette = theme.circle?.decalPalette?.filter(Boolean) || [];
    if (palette.length > 0) return palette;
    return [theme.circle?.accent || theme.fluid?.particle || '#4DB9E5'];
  }, [theme.circle?.accent, theme.circle?.decalPalette, theme.fluid?.particle]);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) reducedMotionRef.current = !!enabled;
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => {
        reducedMotionRef.current = !!enabled;
      }
    );

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  const finish = () => {
    if (completionRef.current) return;
    completionRef.current = true;
    onComplete?.();
  };

  const startSurfaceRipple = (event) => {
    if (entering || !ready) return;

    const x = event?.nativeEvent?.locationX;
    const y = event?.nativeEvent?.locationY;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      setRippleOrigin({ x, y });
    }

    rippleProgress.stopAnimation();
    rippleProgress.setValue(0);
    Animated.timing(rippleProgress, {
      toValue: 1,
      duration: BRAND_MOTION.tapRippleMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.spring(pressScale, {
      toValue: 0.962,
      damping: 17,
      stiffness: 245,
      mass: 0.72,
      useNativeDriver: true,
    }).start();

    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync().catch(() => {});
    }
  };

  const releaseSurface = () => {
    if (!ready) return;
    Animated.spring(pressScale, {
      toValue: 1,
      damping: 15,
      stiffness: 185,
      mass: 0.78,
      useNativeDriver: true,
    }).start();
  };

  const enterCircles = () => {
    if (entering || !ready) return;
    setEntering(true);

    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    if (reducedMotionRef.current) {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: BRAND_MOTION.portalReducedFadeMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(finish);
      return;
    }

    portalRippleProgresses.forEach((progress) => {
      progress.stopAnimation();
      progress.setValue(0);
    });
    backdropOpacity.stopAnimation();
    backdropOpacity.setValue(1);

    const rippleAnimations = RIPPLE_SPECS.map((spec, index) =>
      Animated.sequence([
        Animated.delay(spec.delayMs),
        Animated.timing(portalRippleProgresses[index], {
          toValue: 1,
          duration: spec.durationMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );

    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: BRAND_MOTION.portalCopyFadeMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(circleOpacity, {
        toValue: 0,
        duration: BRAND_MOTION.portalCircleFadeMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(BRAND_MOTION.portalBackdropDelayMs),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: BRAND_MOTION.portalBackdropFadeMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      ...rippleAnimations,
    ]).start(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: BRAND_MOTION.portalOverlayFadeMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(finish);
    });
  };

  return (
    <Animated.View
      style={[styles.overlay, { opacity: overlayOpacity }]}
      accessibilityViewIsModal
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.portalBackdrop,
          {
            opacity: backdropOpacity,
            backgroundColor: theme.welcome.portalBackground[0],
          },
        ]}
      >
        <FloatingCircleField variant="portal" />
      </Animated.View>
      <PortalRippleField
        progresses={portalRippleProgresses}
        width={width}
        height={height}
        palette={ripplePalette}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Animated.View style={[styles.copy, { opacity: contentOpacity }]}> 
          <View style={styles.brandRow}>
            <View style={[styles.brandMark, { borderColor: theme.welcome.brandInk }]} />
            <Text style={[styles.brand, { color: theme.welcome.brandInk }]}>Circles</Text>
          </View>
          <Text style={[styles.title, { color: theme.welcome.brandInk }]}>Welcome back.</Text>
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ready ? 'Enter Circles' : 'Circles is getting ready'}
          accessibilityHint={ready ? 'Opens your Circles home' : undefined}
          disabled={entering || !ready}
          onPressIn={startSurfaceRipple}
          onPressOut={releaseSurface}
          onPress={enterCircles}
          style={[
            styles.circleButton,
            { width: circleSize, height: circleSize },
          ]}
        >
          <Animated.View style={{ opacity: circleOpacity }}>
            <FluidCircle
              size={circleSize}
              pressScale={pressScale}
              rippleProgress={rippleProgress}
              rippleOrigin={rippleOrigin}
            />
          </Animated.View>
        </Pressable>

        <Animated.View style={[styles.promptWrap, { opacity: contentOpacity }]}> 
          <View style={styles.promptRow}>
            {!ready ? <ActivityIndicator size="small" color={theme.colors.subtext} /> : null}
            <Text style={[styles.prompt, { color: theme.colors.subtext }]}>
              {ready ? 'Tap the circle to enter' : 'Getting your Circles ready…'}
            </Text>
          </View>
          <View
            style={[
              styles.promptLine,
              { backgroundColor: theme.welcome.promptLine },
            ]}
          />
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  portalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  rippleLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 3,
  },
  rippleCircle: {
    position: 'absolute',
    overflow: 'hidden',
  },
  rippleEcho: {
    position: 'absolute',
    left: '11%',
    top: '11%',
    right: '11%',
    bottom: '11%',
    borderWidth: 1,
  },
  rippleHighlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.27)',
    transform: [{ rotate: '-18deg' }],
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 46,
    zIndex: 2,
  },
  copy: {
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  brandMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  brand: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    letterSpacing: -0.4,
  },
  title: {
    marginTop: 16,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 17,
    letterSpacing: -0.2,
  },
  circleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 4,
  },
  promptWrap: {
    alignItems: 'center',
  },
  promptRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  prompt: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  promptLine: {
    width: 28,
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
  },
});
