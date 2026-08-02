import React, { useEffect, useRef, useState } from 'react';
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

const BRAND_MOTION = {
  tapRippleMs: 840,
  portalCopyFadeMs: 190,
  portalExpansionDelayMs: 145,
  portalSurfaceFadeMs: 275,
  portalExpansionMs: 690,
  portalOverlayFadeMs: 205,
  portalReducedFadeMs: 240,
};

const BRAND = {
  ink: '#0A1222',
  subtext: '#66717E',
  promptLine: 'rgba(10,18,34,0.28)',
  portalWash: ['#EAF9FF', '#CDEFFF', '#F4FCFF'],
  portalShadow: '#8FD7F4',
};

export function LaunchPortal({ onComplete, ready = true }) {
  const { width, height } = useWindowDimensions();
  const circleSize = Math.min(230, Math.max(176, width * 0.56));
  const pressScale = useRef(new Animated.Value(1)).current;
  const rippleProgress = useRef(new Animated.Value(0)).current;
  const expansionScale = useRef(new Animated.Value(1)).current;
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

    const coverScale = (Math.max(width, height) / circleSize) * 2.35;

    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: BRAND_MOTION.portalCopyFadeMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(BRAND_MOTION.portalExpansionDelayMs),
        Animated.parallel([
          Animated.timing(circleOpacity, {
            toValue: 0,
            duration: BRAND_MOTION.portalSurfaceFadeMs,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(expansionScale, {
            toValue: coverScale,
            duration: BRAND_MOTION.portalExpansionMs,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
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
      <FloatingCircleField variant="portal" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Animated.View style={[styles.copy, { opacity: contentOpacity }]}> 
          <View style={styles.brandRow}>
            <View style={styles.brandMark} />
            <Text style={styles.brand}>Circles</Text>
          </View>
          <Text style={styles.title}>Welcome back.</Text>
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
          <Animated.View
            pointerEvents="none"
            style={[
              styles.portalWash,
              {
                width: circleSize,
                height: circleSize,
                borderRadius: circleSize / 2,
                transform: [{ scale: expansionScale }],
              },
            ]}
          >
            <LinearGradient
              colors={BRAND.portalWash}
              locations={[0, 0.55, 1]}
              start={{ x: 0.18, y: 0.08 }}
              end={{ x: 0.86, y: 0.95 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

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
            {!ready ? <ActivityIndicator size="small" color={BRAND.subtext} /> : null}
            <Text style={styles.prompt}>
              {ready ? 'Tap the circle to enter' : 'Getting your Circles ready…'}
            </Text>
          </View>
          <View style={styles.promptLine} />
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
    backgroundColor: '#F3FAFF',
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
    borderColor: BRAND.ink,
  },
  brand: {
    color: BRAND.ink,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    letterSpacing: -0.4,
  },
  title: {
    marginTop: 16,
    color: BRAND.ink,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 17,
    letterSpacing: -0.2,
  },
  circleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  portalWash: {
    position: 'absolute',
    overflow: 'hidden',
    shadowColor: BRAND.portalShadow,
    shadowOpacity: 0.15,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
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
    color: BRAND.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  promptLine: {
    width: 28,
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
    backgroundColor: BRAND.promptLine,
  },
});
