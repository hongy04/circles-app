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

function FeedGlyph({ ink, accent, accent2 }) {
  return (
    <View style={styles.glyphBox}>
      <View style={[styles.feedCardBack, { backgroundColor: rgba(accent2, 0.55) }]} />
      <View style={[styles.feedCardMid, { backgroundColor: rgba(accent, 0.7) }]} />
      <View style={[styles.feedCardFront, { borderColor: rgba(ink, 0.72) }]}>
        <View style={[styles.feedDot, { backgroundColor: accent }]} />
        <View style={[styles.feedLine, { backgroundColor: rgba(ink, 0.72) }]} />
        <View style={[styles.feedLineShort, { backgroundColor: rgba(ink, 0.44) }]} />
      </View>
    </View>
  );
}

function MutualsGlyph({ ink, accent, accent2 }) {
  return (
    <View style={styles.glyphBox}>
      <View style={[styles.mutualOrb, styles.mutualOrbLeft, { backgroundColor: rgba(accent, 0.72), borderColor: rgba(ink, 0.55) }]} />
      <View style={[styles.mutualOrb, styles.mutualOrbRight, { backgroundColor: rgba(accent2, 0.7), borderColor: rgba(ink, 0.55) }]} />
      <View style={[styles.mutualBridge, { backgroundColor: 'rgba(255,255,255,0.78)', borderColor: rgba(ink, 0.5) }]} />
    </View>
  );
}

function CirclesGlyph({ ink, accent, accent2 }) {
  return (
    <View style={styles.glyphBox}>
      <View style={[styles.circleGlyph, styles.circleGlyphTop, { borderColor: ink, backgroundColor: rgba(accent2, 0.38) }]} />
      <View style={[styles.circleGlyph, styles.circleGlyphLeft, { borderColor: ink, backgroundColor: rgba(accent, 0.38) }]} />
      <View style={[styles.circleGlyph, styles.circleGlyphRight, { borderColor: ink, backgroundColor: 'rgba(255,255,255,0.72)' }]} />
    </View>
  );
}

function MeGlyph({ ink, accent }) {
  return (
    <View style={styles.glyphBox}>
      <LinearGradient
        colors={['rgba(255,255,255,0.96)', rgba(accent, 0.36)]}
        style={[styles.meHead, { borderColor: rgba(ink, 0.72) }]}
      />
      <View style={[styles.meBody, { borderColor: rgba(ink, 0.72), backgroundColor: rgba(accent, 0.34) }]} />
    </View>
  );
}

function AeroEmblem({ routeName, theme, focused }) {
  const tokens = theme.navigation?.aero || {};
  const palette = theme.circle?.decalPalette || [];
  const accent = palette[0] || theme.circle.accent;
  const accent2 = palette[1] || '#70DC9D';
  const ink = tokens.iconInk || theme.welcome.brandInk || theme.colors.text;

  const glyph =
    routeName === 'Circles' ? <CirclesGlyph ink={ink} accent={accent} accent2={accent2} /> :
    routeName === 'Mutuals' ? <MutualsGlyph ink={ink} accent={accent} accent2={accent2} /> :
    routeName === 'Feed' ? <FeedGlyph ink={ink} accent={accent} accent2={accent2} /> :
    <MeGlyph ink={ink} accent={accent} />;

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
          ? [tokens.orbSelectedTop || '#FFFFFF', tokens.orbSelectedBottom || '#DDF4FF']
          : [tokens.orbTop || 'rgba(255,255,255,0.92)', tokens.orbBottom || 'rgba(232,248,255,0.88)']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[
          styles.emblem,
          {
            borderColor: focused
              ? tokens.selectedBorder || rgba(theme.circle.accent, 0.72)
              : tokens.orbBorder || 'rgba(255,255,255,0.9)',
          },
        ]}
      >
        {glyph}
        <View style={styles.emblemShine} />
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

  useEffect(() => {
    Animated.spring(lift, {
      toValue: focused ? 1 : 0,
      damping: 16,
      stiffness: 190,
      mass: 0.65,
      useNativeDriver: true,
    }).start();
  }, [focused, lift]);

  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });

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

  return (
    <View
      style={[
        styles.root,
        {
          paddingBottom: Math.max(7, insets?.bottom || 0),
          backgroundColor: theme.colors.bg,
        },
      ]}
    >
      <View
        style={[
          styles.stationShadow,
          {
            shadowColor: tokens.stationShadow || '#74B6D4',
          },
        ]}
      >
        <LinearGradient
          colors={[
            tokens.stationTop || 'rgba(255,255,255,0.97)',
            tokens.stationBottom || 'rgba(224,247,255,0.96)',
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.station,
            { borderColor: tokens.stationBorder || 'rgba(255,255,255,0.96)' },
          ]}
        >
          <View pointerEvents="none" style={styles.skySheen} />
          <GrassRidge theme={theme} activeIndex={state.index} totalTabs={state.routes.length} />
          <View style={styles.tabsRow}>
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
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 7,
    paddingHorizontal: 10,
  },
  stationShadow: {
    borderRadius: 30,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  station: {
    height: 72,
    borderRadius: 30,
    borderWidth: 1.2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  skySheen: {
    position: 'absolute',
    top: 5,
    left: 18,
    right: 18,
    height: 22,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.34)',
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
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 72,
    paddingHorizontal: 5,
    paddingBottom: 5,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 62,
  },
  emblemOuter: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  emblem: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emblemShine: {
    position: 'absolute',
    top: 4,
    left: 8,
    width: 15,
    height: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.62)',
    transform: [{ rotate: '-12deg' }],
  },
  glyphBox: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedCardBack: {
    position: 'absolute',
    width: 16,
    height: 13,
    borderRadius: 4,
    transform: [{ translateX: 3 }, { translateY: -4 }, { rotate: '8deg' }],
  },
  feedCardMid: {
    position: 'absolute',
    width: 17,
    height: 14,
    borderRadius: 4,
    transform: [{ translateX: -2 }, { translateY: -1 }, { rotate: '-5deg' }],
  },
  feedCardFront: {
    position: 'absolute',
    width: 18,
    height: 15,
    borderRadius: 4.5,
    borderWidth: 1.1,
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: 3,
    paddingTop: 3,
  },
  feedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginBottom: 2,
  },
  feedLine: { width: 10, height: 1.4, borderRadius: 1, marginBottom: 1.5 },
  feedLineShort: { width: 7, height: 1.4, borderRadius: 1 },
  mutualOrb: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
  },
  mutualOrbLeft: { transform: [{ translateX: -5 }, { translateY: -2 }] },
  mutualOrbRight: { transform: [{ translateX: 5 }, { translateY: -2 }] },
  mutualBridge: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    transform: [{ translateY: 5 }],
  },
  circleGlyph: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.2,
  },
  circleGlyphTop: { transform: [{ translateY: -5 }] },
  circleGlyphLeft: { transform: [{ translateX: -6 }, { translateY: 4 }] },
  circleGlyphRight: { transform: [{ translateX: 6 }, { translateY: 4 }] },
  meHead: {
    position: 'absolute',
    top: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.1,
  },
  meBody: {
    position: 'absolute',
    bottom: 2,
    width: 18,
    height: 11,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    borderWidth: 1.1,
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
    top: -3,
    right: -7,
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
