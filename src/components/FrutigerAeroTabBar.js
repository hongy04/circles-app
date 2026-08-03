import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(10,18,34,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function GrassRidge({ theme, activeIndex = 0, totalTabs = 4 }) {
  const tokens = theme.navigation?.aero || {};
  const breezeA = useRef(new Animated.Value(0)).current;
  const breezeB = useRef(new Animated.Value(0)).current;
  const breezeC = useRef(new Animated.Value(0)).current;
  const gust = useRef(new Animated.Value(0)).current;

  const particles = useMemo(() => {
    const rows = 4;
    const cols = 44;
    const all = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const stagger = row % 2 === 0 ? 0.1 : 0.58;
        const jitter = ((((col + 1) * (row + 3) * 17) % 9) - 4) * 0.12;
        const left = clamp(((col + stagger) / cols) * 100 + jitter, 1, 99);
        const xNorm = left / 100;
        const width = 1.1 + (((col * 7 + row * 3) % 4) * 0.18);
        const height = 3.2 + row * 1.15 + (((col * 5 + row * 11) % 4) * 0.5);
        const bottom = 2 + row * 3.1 + (((col * 3 + row) % 2) * 0.35);
        const opacity = 0.24 + row * 0.1 + (((col + row * 2) % 3) * 0.04);
        const paletteBand = (col + row) % 3;
        const baseColor = paletteBand === 0
          ? rgba(tokens.grassLight || '#DDF6AF', 0.82)
          : paletteBand === 1
            ? rgba(tokens.grassMid || '#A6E17B', 0.84)
            : rgba(tokens.grassDark || '#70BE64', 0.82);

        all.push({
          key: `${row}-${col}`,
          left: `${left}%`,
          xNorm,
          width,
          height,
          bottom,
          opacity,
          color: baseColor,
          group: (col + row) % 3,
          direction: row % 2 === 0 ? 1 : -1,
          rotate: `${-4 + (((col * 13 + row * 19) % 9))}deg`,
        });
      }
    }

    return all;
  }, [tokens.grassDark, tokens.grassLight, tokens.grassMid]);

  useEffect(() => {
    const makeLoop = (value, duration, delay = 0) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            useNativeDriver: true,
          }),
        ])
      );

    const loopA = makeLoop(breezeA, 3400);
    const loopB = makeLoop(breezeB, 4300, 180);
    const loopC = makeLoop(breezeC, 5200, 90);

    loopA.start();
    loopB.start();
    loopC.start();

    return () => {
      loopA.stop();
      loopB.stop();
      loopC.stop();
    };
  }, [breezeA, breezeB, breezeC]);

  useEffect(() => {
    gust.stopAnimation();
    gust.setValue(0);
    Animated.sequence([
      Animated.timing(gust, {
        toValue: 1,
        duration: 340,
        useNativeDriver: true,
      }),
      Animated.timing(gust, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeIndex, gust]);

  const activeCenter = clamp((activeIndex + 0.5) / Math.max(1, totalTabs), 0.08, 0.92);

  const breezeXByGroup = [
    breezeA.interpolate({ inputRange: [0, 1], outputRange: [-1.2, 1.2] }),
    breezeB.interpolate({ inputRange: [0, 1], outputRange: [1.4, -1.1] }),
    breezeC.interpolate({ inputRange: [0, 1], outputRange: [-1.0, 1.5] }),
  ];
  const breezeYByGroup = [
    breezeB.interpolate({ inputRange: [0, 1], outputRange: [0.3, -0.9] }),
    breezeC.interpolate({ inputRange: [0, 1], outputRange: [-0.8, 0.2] }),
    breezeA.interpolate({ inputRange: [0, 1], outputRange: [0.25, -0.7] }),
  ];

  return (
    <View pointerEvents="none" style={styles.grassWrap}>
      <LinearGradient
        colors={[
          rgba(tokens.grassLight || '#DDF6AF', 0),
          rgba(tokens.grassLight || '#DDF6AF', 0.22),
          rgba(tokens.grassMid || '#A6E17B', 0.42),
          rgba(tokens.grassDark || '#70BE64', 0.6),
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.grassBase}
      />
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.14)',
          'rgba(255,255,255,0)',
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.grassMist}
      />
      {particles.map((particle) => {
        const focusWeight = clamp(1 - Math.abs(particle.xNorm - activeCenter) / 0.28, 0, 1);
        const gustX = gust.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: [
            0,
            particle.direction * focusWeight * 2.4,
            0,
          ],
        });
        const gustY = gust.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: [
            0,
            -focusWeight * 1.35,
            0,
          ],
        });
        const glowOpacity = gust.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: [0.05, 0.05 + (focusWeight * 0.16), 0.05],
        });
        const swayX = breezeXByGroup[particle.group];
        const swayY = breezeYByGroup[particle.group];

        return (
          <Animated.View
            key={particle.key}
            style={[
              styles.grassParticle,
              {
                left: particle.left,
                bottom: particle.bottom,
                width: particle.width,
                height: particle.height,
                opacity: particle.opacity,
                backgroundColor: particle.color,
                borderRadius: particle.width,
                transform: [
                  { translateX: Animated.add(swayX, gustX) },
                  { translateY: Animated.add(swayY, gustY) },
                  { rotate: particle.rotate },
                ],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.grassParticleGlow,
                {
                  opacity: glowOpacity,
                },
              ]}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

function GlassOrb({ size = 10, accent, accent2, style }) {
  return (
    <LinearGradient
      colors={[
        'rgba(255,255,255,0.98)',
        rgba(accent, 0.82),
        rgba(accent2 || accent, 0.64),
      ]}
      locations={[0, 0.42, 1]}
      start={{ x: 0.18, y: 0.08 }}
      end={{ x: 0.82, y: 0.94 }}
      style={[
        styles.glassOrb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: 'rgba(255,255,255,0.88)',
        },
        style,
      ]}
    >
      <View
        style={[
          styles.glassOrbHighlight,
          {
            width: size * 0.28,
            height: size * 0.16,
            borderRadius: size,
            top: size * 0.13,
            left: size * 0.16,
          },
        ]}
      />
      <View
        style={[
          styles.glassOrbDepth,
          {
            width: size * 0.55,
            height: size * 0.2,
            borderRadius: size,
            bottom: size * 0.08,
            right: size * 0.05,
          },
        ]}
      />
    </LinearGradient>
  );
}

function GlassPawn({ accent, accent2, large = false, style }) {
  const headSize = large ? 11.5 : 9.5;
  const bodyWidth = large ? 18 : 14;
  const bodyHeight = large ? 14 : 12;

  return (
    <View style={[styles.pawnWrap, large && styles.pawnWrapLarge, style]}>
      <GlassOrb
        size={headSize}
        accent={accent}
        accent2={accent2}
        style={styles.pawnHead}
      />
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.88)',
          rgba(accent, 0.78),
          rgba(accent2 || accent, 0.68),
        ]}
        locations={[0, 0.4, 1]}
        start={{ x: 0.12, y: 0.06 }}
        end={{ x: 0.88, y: 0.95 }}
        style={[
          styles.pawnBody,
          {
            width: bodyWidth,
            height: bodyHeight,
            borderTopLeftRadius: bodyWidth * 0.42,
            borderTopRightRadius: bodyWidth * 0.42,
            borderBottomLeftRadius: bodyWidth * 0.23,
            borderBottomRightRadius: bodyWidth * 0.23,
          },
        ]}
      >
        <View style={styles.pawnBodyHighlight} />
        <View style={styles.pawnBodyCaustic} />
      </LinearGradient>
    </View>
  );
}

function FeedGlyph({ accent, accent2 }) {
  return (
    <View style={styles.glyphBox}>
      <LinearGradient
        colors={[rgba(accent2, 0.54), 'rgba(255,255,255,0.82)']}
        style={[styles.glassFeedPane, styles.glassFeedPaneBack]}
      />
      <LinearGradient
        colors={[rgba(accent, 0.66), 'rgba(255,255,255,0.84)']}
        style={[styles.glassFeedPane, styles.glassFeedPaneMid]}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.96)', rgba(accent, 0.42), rgba(accent2, 0.46)]}
        locations={[0, 0.6, 1]}
        start={{ x: 0.15, y: 0.05 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.glassFeedPane, styles.glassFeedPaneFront]}
      >
        <View style={styles.feedGlassShine} />
        <View style={[styles.feedGlassDot, { backgroundColor: rgba(accent, 0.86) }]} />
        <View style={styles.feedGlassLine} />
        <View style={[styles.feedGlassLine, styles.feedGlassLineShort]} />
      </LinearGradient>
    </View>
  );
}

function MutualsGlyph({ accent, accent2 }) {
  return (
    <View style={styles.glyphBox}>
      <View style={styles.mutualGlow} />
      <GlassPawn
        accent={accent}
        accent2={accent2}
        style={styles.mutualPawnLeft}
      />
      <GlassPawn
        accent={accent2}
        accent2={accent}
        style={styles.mutualPawnRight}
      />
    </View>
  );
}

function CirclesGlyph({ accent, accent2 }) {
  return (
    <View style={styles.glyphBox}>
      <View style={styles.circleGlyphGlow} />
      <GlassOrb
        size={11.5}
        accent={accent2}
        accent2={accent}
        style={styles.circleOrbTop}
      />
      <GlassOrb
        size={12}
        accent={accent}
        accent2={accent2}
        style={styles.circleOrbLeft}
      />
      <GlassOrb
        size={12}
        accent={accent2}
        accent2="#8EDCFF"
        style={styles.circleOrbRight}
      />
    </View>
  );
}

function MeGlyph({ accent, accent2 }) {
  return (
    <View style={styles.glyphBox}>
      <View style={styles.meGlow} />
      <GlassPawn
        large
        accent={accent}
        accent2={accent2}
        style={styles.mePawn}
      />
    </View>
  );
}

function BubbleLightField({ routeName, accent, accent2, focused }) {
  const variant = routeName === 'Mutuals'
    ? styles.bubbleLightMutuals
    : routeName === 'Feed'
      ? styles.bubbleLightFeed
      : routeName === 'Me'
        ? styles.bubbleLightMe
        : styles.bubbleLightCircles;
  const secondaryVariant = routeName === 'Mutuals'
    ? styles.bubbleSecondaryMutuals
    : routeName === 'Feed'
      ? styles.bubbleSecondaryFeed
      : routeName === 'Me'
        ? styles.bubbleSecondaryMe
        : styles.bubbleSecondaryCircles;
  const pinVariant = routeName === 'Mutuals'
    ? styles.bubblePinGlintMutuals
    : routeName === 'Feed'
      ? styles.bubblePinGlintFeed
      : routeName === 'Me'
        ? styles.bubblePinGlintMe
        : styles.bubblePinGlintCircles;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.98)',
          rgba(accent2 || accent, focused ? 0.28 : 0.18),
          rgba(accent, focused ? 0.32 : 0.2),
          'rgba(214,244,255,0.18)',
        ]}
        locations={[0, 0.22, 0.62, 1]}
        start={{ x: 0.18, y: 0.02 }}
        end={{ x: 0.86, y: 1 }}
        style={styles.bubbleBaseBlend}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.70)', 'rgba(255,255,255,0.04)']}
        start={{ x: 0.24, y: 0 }}
        end={{ x: 0.78, y: 1 }}
        style={styles.bubbleTopCap}
      />
      <LinearGradient
        colors={[
          rgba(accent2 || accent, focused ? 0.04 : 0.02),
          rgba(accent2 || accent, focused ? 0.18 : 0.12),
          rgba(accent, focused ? 0.32 : 0.22),
          'rgba(255,255,255,0.22)',
        ]}
        locations={[0, 0.38, 0.84, 1]}
        start={{ x: 0.5, y: 0.28 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bubbleBottomPool}
      />
      <View
        style={[
          styles.bubbleColorPool,
          {
            backgroundColor: rgba(accent2 || accent, focused ? 0.24 : 0.17),
          },
        ]}
      />
      <View
        style={[
          styles.bubbleColorPoolSecondary,
          {
            backgroundColor: rgba(accent, focused ? 0.18 : 0.12),
          },
        ]}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.72)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
        locations={[0, 0.55, 1]}
        start={{ x: 0.12, y: 0.08 }}
        end={{ x: 0.94, y: 0.96 }}
        style={[styles.bubbleSpecular, variant]}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.50)', 'rgba(255,255,255,0)']}
        start={{ x: 0.08, y: 0.08 }}
        end={{ x: 0.92, y: 0.92 }}
        style={[styles.bubbleSpecularSecondary, secondaryVariant]}
      />
      <View style={[styles.bubblePinGlint, pinVariant]} />
      <View style={styles.bubbleLowerRefraction} />
      <View style={styles.bubbleHorizonBand} />
      <View style={styles.bubbleSideBloom} />
      <View style={styles.bubbleEdgeShade} />
      <View style={styles.bubbleRimLight} />
    </View>
  );
}

function AeroEmblem({ routeName, theme, focused }) {
  const tokens = theme.navigation?.aero || {};
  const palette = theme.circle?.decalPalette || [];
  const accent = palette[0] || theme.circle.accent;
  const accent2 = palette[1] || '#70DC9D';
  const glyph =
    routeName === 'Circles' ? <CirclesGlyph accent={accent} accent2={accent2} /> :
    routeName === 'Mutuals' ? <MutualsGlyph accent={accent} accent2={accent2} /> :
    routeName === 'Feed' ? <FeedGlyph accent={accent} accent2={accent2} /> :
    <MeGlyph accent={accent} accent2={accent2} />;

  return (
    <View
      style={[
        styles.emblemOuter,
        focused && {
          shadowColor: tokens.selectedGlow || theme.circle.accent,
          shadowOpacity: 0.28,
          shadowRadius: 11,
          shadowOffset: { width: 0, height: 4 },
          elevation: 7,
        },
      ]}
    >
      <LinearGradient
        colors={focused
          ? ['rgba(255,255,255,0.96)', rgba(accent2, 0.22), rgba(accent, 0.30), 'rgba(214,246,255,0.58)']
          : ['rgba(255,255,255,0.90)', rgba(accent2, 0.12), rgba(accent, 0.18), 'rgba(220,245,255,0.42)']}
        locations={[0, 0.26, 0.66, 1]}
        start={{ x: 0.14, y: 0.02 }}
        end={{ x: 0.9, y: 1 }}
        style={[
          styles.emblem,
          {
            borderColor: focused
              ? tokens.selectedBorder || rgba(theme.circle.accent, 0.66)
              : tokens.orbBorder || 'rgba(255,255,255,0.82)',
          },
        ]}
      >
        <BubbleLightField
          routeName={routeName}
          accent={accent}
          accent2={accent2}
          focused={focused}
        />
        <View style={styles.emblemInnerRing} />
        <View style={styles.glyphDepth}>{glyph}</View>
      </LinearGradient>
    </View>
  );
}

function AeroTabItem({
  route,
  focused,
  label,
  navigation,
  descriptor,
  theme,
  badgeCount = 0,
}) {
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(lift, {
      toValue: focused ? 1 : 0,
      damping: 16,
      stiffness: 185,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [focused, lift]);

  const translateY = Animated.add(
    lift.interpolate({ inputRange: [0, 1], outputRange: [0, -4.8] }),
    press.interpolate({ inputRange: [0, 1], outputRange: [0, 1.4] })
  );
  const scale = Animated.multiply(
    lift.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.025] }),
    press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.972] })
  );

  const onPressIn = () => {
    Animated.timing(press, {
      toValue: 1,
      duration: 90,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(press, {
      toValue: 0,
      damping: 12,
      stiffness: 210,
      mass: 0.52,
      useNativeDriver: true,
    }).start();
  };

  const onPress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  const onLongPress = () => {
    navigation.emit({ type: 'tabLongPress', target: route.key });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={descriptor.options.tabBarAccessibilityLabel}
      testID={descriptor.options.tabBarButtonTestID}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onLongPress={onLongPress}
      style={styles.tabItem}
    >
      <Animated.View style={{ alignItems: 'center', transform: [{ translateY }, { scale }] }}>
        <View>
          <AeroEmblem routeName={route.name} theme={theme} focused={focused} />
          {badgeCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.circle.accent, borderColor: theme.colors.surface }]}>
              <Text style={[styles.badgeText, { color: theme.colors.onPrimary }]}>
                {badgeCount > 99 ? '99+' : String(badgeCount)}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            {
              color: focused
                ? theme.navigation?.aero?.labelActive || theme.welcome.brandInk
                : theme.navigation?.aero?.labelInactive || theme.colors.subtext,
            },
            focused && styles.tabLabelFocused,
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function FrutigerAeroTabBar({
  state,
  descriptors,
  navigation,
  insets,
  theme,
  mutualsBadgeCount = 0,
  circlesBadgeCount = 0,
}) {
  const tokens = theme.navigation?.aero || {};
  const safeBottom = Math.max(8, insets?.bottom || 0);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.root,
        { height: 88 + safeBottom },
      ]}
    >
      <View
        style={[
          styles.stationShadow,
          {
            bottom: safeBottom + 6,
            shadowColor: tokens.stationShadow || '#74B6D4',
          },
        ]}
      >
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.80)',
            rgba(theme.circle?.accent || '#4DB9E5', 0.14),
            'rgba(224,247,255,0.72)',
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.stationGlass,
            { borderColor: 'rgba(255,255,255,0.68)' },
          ]}
        >
          <View pointerEvents="none" style={styles.skySheen} />
          <View pointerEvents="none" style={styles.stationCaustic} />
          <GrassRidge theme={theme} activeIndex={state.index} totalTabs={state.routes.length} />
        </LinearGradient>

        <View style={styles.tabsRow} pointerEvents="box-none">
          {state.routes.map((route, index) => {
            const descriptor = descriptors[route.key];
            const options = descriptor.options;
            const focused = state.index === index;
            const rawLabel = options.tabBarLabel ?? options.title ?? route.name;
            const label = typeof rawLabel === 'string' ? rawLabel : route.name;
            const badgeCount = route.name === 'Mutuals'
              ? mutualsBadgeCount
              : route.name === 'Circles'
                ? circlesBadgeCount
                : 0;

            return (
              <AeroTabItem
                key={route.key}
                route={route}
                focused={focused}
                label={label}
                navigation={navigation}
                descriptor={descriptor}
                theme={theme}
                badgeCount={badgeCount}
              />
            );
          })}
        </View>
      </View>
    </View>
  );

}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 100,
    elevation: 100,
    overflow: 'visible',
  },
  stationShadow: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 70,
    borderRadius: 31,
    overflow: 'visible',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10,
  },
  stationGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 31,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  skySheen: {
    position: 'absolute',
    top: 4,
    left: 18,
    right: 18,
    height: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.40)',
  },
  stationCaustic: {
    position: 'absolute',
    left: '20%',
    right: '20%',
    bottom: -10,
    height: 30,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  grassWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
    overflow: 'hidden',
  },
  grassBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 24,
  },
  grassMist: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 11,
    height: 10,
  },
  grassParticle: {
    position: 'absolute',
    overflow: 'hidden',
  },
  grassParticleGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  tabsRow: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 5,
    paddingBottom: 5,
    overflow: 'visible',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 62,
  },
  emblemOuter: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    overflow: 'visible',
    shadowColor: '#0A1222',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  emblem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  emblemInnerRing: {
    ...StyleSheet.absoluteFillObject,
    margin: 2,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.70)',
  },
  glyphDepth: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#083954',
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1.2 },
  },
  bubbleColorPool: {
    position: 'absolute',
    width: 34,
    height: 28,
    borderRadius: 24,
    left: -5,
    bottom: -8,
    transform: [{ rotate: '18deg' }],
  },
  bubbleColorPoolSecondary: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 18,
    right: -6,
    top: 10,
  },
  bubbleBaseBlend: {
    ...StyleSheet.absoluteFillObject,
  },
  bubbleTopCap: {
    position: 'absolute',
    left: 3,
    right: 3,
    top: 2,
    height: 14,
    borderTopLeftRadius: 17,
    borderTopRightRadius: 17,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  bubbleBottomPool: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 3,
    height: 19,
    borderRadius: 15,
  },
  bubbleSpecular: {
    position: 'absolute',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 0 },
  },
  bubbleSpecularSecondary: {
    position: 'absolute',
  },
  bubbleLightCircles: {
    width: 16,
    height: 7,
    borderRadius: 10,
    top: 4,
    left: 5,
    transform: [{ rotate: '-17deg' }],
  },
  bubbleSecondaryCircles: {
    width: 8,
    height: 12,
    borderRadius: 8,
    top: 7,
    right: 6,
    transform: [{ rotate: '16deg' }],
  },
  bubbleLightMutuals: {
    width: 10,
    height: 9,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 10,
    top: 5,
    left: 8,
    transform: [{ rotate: '-25deg' }],
  },
  bubbleSecondaryMutuals: {
    width: 8,
    height: 8,
    borderRadius: 6,
    top: 11,
    right: 7,
    transform: [{ rotate: '18deg' }],
  },
  bubbleLightFeed: {
    width: 5,
    height: 16,
    borderRadius: 5,
    top: 5,
    left: 7,
    transform: [{ rotate: '19deg' }],
  },
  bubbleSecondaryFeed: {
    width: 10,
    height: 6,
    borderRadius: 6,
    top: 7,
    right: 7,
    transform: [{ rotate: '-10deg' }],
  },
  bubbleLightMe: {
    width: 12,
    height: 6,
    borderRadius: 8,
    top: 4,
    right: 7,
    transform: [{ rotate: '15deg' }],
  },
  bubbleSecondaryMe: {
    width: 7,
    height: 11,
    borderRadius: 7,
    top: 8,
    left: 8,
    transform: [{ rotate: '-18deg' }],
  },
  bubblePinGlint: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.78)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.22,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 0 },
  },
  bubblePinGlintCircles: {
    top: 8,
    right: 7,
    width: 2.6,
    height: 2.6,
    borderRadius: 3,
  },
  bubblePinGlintMutuals: {
    top: 13,
    left: 5,
    width: 2.2,
    height: 5,
    borderRadius: 4,
    transform: [{ rotate: '18deg' }],
  },
  bubblePinGlintFeed: {
    top: 9,
    right: 7,
    width: 2.2,
    height: 2.2,
    borderRadius: 3,
  },
  bubblePinGlintMe: {
    left: 6,
    bottom: 10,
    width: 4.5,
    height: 2.1,
    borderRadius: 4,
    transform: [{ rotate: '-28deg' }],
  },
  bubbleLowerRefraction: {
    position: 'absolute',
    left: 6,
    right: 5,
    bottom: 4,
    height: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.20)',
    transform: [{ rotate: '-4deg' }],
  },
  bubbleHorizonBand: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 17,
    height: 2.4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  bubbleSideBloom: {
    position: 'absolute',
    right: 3,
    top: 10,
    width: 9,
    height: 17,
    borderRadius: 10,
    backgroundColor: 'rgba(165,245,255,0.18)',
    transform: [{ rotate: '11deg' }],
  },
  bubbleEdgeShade: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 26,
    height: 26,
    borderRadius: 17,
    borderWidth: 5,
    borderColor: 'rgba(0,72,110,0.10)',
  },
  bubbleRimLight: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  glyphBox: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  glassOrb: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#0A1222',
    shadowOpacity: 0.12,
    shadowRadius: 1.8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  glassOrbHighlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.62)',
    transform: [{ rotate: '-18deg' }],
  },
  glassOrbDepth: {
    position: 'absolute',
    backgroundColor: 'rgba(0,82,120,0.10)',
    transform: [{ rotate: '-7deg' }],
  },
  pawnWrap: {
    position: 'absolute',
    width: 16,
    height: 23,
    alignItems: 'center',
  },
  pawnWrapLarge: {
    width: 20,
    height: 26,
  },
  pawnHead: {
    position: 'relative',
    top: 0,
    zIndex: 3,
  },
  pawnBody: {
    position: 'absolute',
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.82)',
    overflow: 'hidden',
    shadowColor: '#0A4262',
    shadowOpacity: 0.14,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  pawnBodyHighlight: {
    position: 'absolute',
    top: 2,
    left: 3,
    width: '28%',
    height: '48%',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.38)',
    transform: [{ rotate: '10deg' }],
  },
  pawnBodyCaustic: {
    position: 'absolute',
    left: 3,
    right: 3,
    bottom: 1,
    height: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  mutualGlow: {
    position: 'absolute',
    bottom: 1,
    width: 25,
    height: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(80,200,210,0.16)',
  },
  mutualPawnLeft: {
    left: 1.5,
    bottom: 1,
    transform: [{ rotate: '-4deg' }],
  },
  mutualPawnRight: {
    right: 1.5,
    bottom: 1,
    transform: [{ rotate: '4deg' }],
  },
  circleGlyphGlow: {
    position: 'absolute',
    width: 24,
    height: 13,
    bottom: 2,
    borderRadius: 14,
    backgroundColor: 'rgba(83,205,235,0.12)',
  },
  circleOrbTop: {
    top: 0,
    left: 7.5,
  },
  circleOrbLeft: {
    left: 1.5,
    bottom: 1,
  },
  circleOrbRight: {
    right: 1.5,
    bottom: 1,
  },
  glassFeedPane: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.86)',
    overflow: 'hidden',
    shadowColor: '#0A5470',
    shadowOpacity: 0.13,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  glassFeedPaneBack: {
    width: 17,
    height: 15,
    borderRadius: 5.5,
    transform: [{ translateX: 3.5 }, { translateY: -4 }, { rotate: '8deg' }],
  },
  glassFeedPaneMid: {
    width: 18,
    height: 16,
    borderRadius: 5.5,
    transform: [{ translateX: -2.5 }, { translateY: -1 }, { rotate: '-6deg' }],
  },
  glassFeedPaneFront: {
    width: 19,
    height: 17,
    borderRadius: 6,
    paddingLeft: 4,
    paddingTop: 5,
  },
  feedGlassShine: {
    position: 'absolute',
    top: 1.5,
    left: 3,
    width: 10,
    height: 3.5,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.68)',
    transform: [{ rotate: '-7deg' }],
  },
  feedGlassDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginBottom: 2,
  },
  feedGlassLine: {
    width: 10,
    height: 1.6,
    borderRadius: 2,
    marginBottom: 1.5,
    backgroundColor: 'rgba(10,18,34,0.52)',
  },
  feedGlassLineShort: {
    width: 7,
    backgroundColor: 'rgba(10,18,34,0.32)',
  },
  meGlow: {
    position: 'absolute',
    bottom: 1,
    width: 21,
    height: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(83,205,235,0.14)',
  },
  mePawn: {
    bottom: 0,
  },
  tabLabel: {
    marginTop: 1,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10.5,
    letterSpacing: -0.1,
  },
  tabLabelFocused: {
    fontFamily: 'Manrope_700Bold',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 8.5,
    lineHeight: 10,
  },
});
