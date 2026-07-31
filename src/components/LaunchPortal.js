import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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

import { COLORS } from '../theme/colors';
import { FluidCircle } from './FluidCircle';
import { FloatingCircleField } from './FloatingCircleField';

export function LaunchPortal({ onComplete }) {
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
    if (entering) return;

    const x = event?.nativeEvent?.locationX;
    const y = event?.nativeEvent?.locationY;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      setRippleOrigin({ x, y });
    }

    rippleProgress.stopAnimation();
    rippleProgress.setValue(0);
    Animated.timing(rippleProgress, {
      toValue: 1,
      duration: 840,
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
    Animated.spring(pressScale, {
      toValue: 1,
      damping: 15,
      stiffness: 185,
      mass: 0.78,
      useNativeDriver: true,
    }).start();
  };

  const enterCircles = () => {
    if (entering) return;
    setEntering(true);

    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    if (reducedMotionRef.current) {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(finish);
      return;
    }

    const coverScale = (Math.max(width, height) / circleSize) * 2.35;

    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 190,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(145),
        Animated.parallel([
          Animated.timing(circleOpacity, {
            toValue: 0,
            duration: 275,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(expansionScale, {
            toValue: coverScale,
            duration: 690,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 205,
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
          <Text style={styles.eyebrow}>CIRCLES</Text>
          <Text style={styles.title}>Welcome back.</Text>
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter Circles"
          accessibilityHint="Opens your Circles home"
          disabled={entering}
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
              colors={['#EAF9FF', '#CDEFFF', '#F4FCFF']}
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
          <Text style={styles.prompt}>Tap the circle to enter</Text>
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
    backgroundColor: '#F7FCFF',
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 44,
    paddingBottom: 46,
    zIndex: 2,
  },
  copy: {
    alignItems: 'center',
  },
  eyebrow: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    letterSpacing: 5.2,
  },
  title: {
    marginTop: 17,
    color: COLORS.text,
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
    shadowColor: '#8FD7F4',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  promptWrap: {
    alignItems: 'center',
  },
  prompt: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  promptLine: {
    width: 28,
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
    backgroundColor: 'rgba(17,17,17,0.35)',
  },
});
