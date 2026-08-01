import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { FloatingCircleField } from '../../components/FloatingCircleField';
import { FluidCircle } from '../../components/FluidCircle';
import { LaunchPortal } from '../../components/LaunchPortal';
import {
  DEFAULT_THEME_ID,
  THEME_OPTIONS,
  getTheme,
} from '../../theme/themes';
import { useTheme, useThemeTokens } from '../../theme/ThemeProvider';

function ThemeSampleCircle() {
  const theme = useThemeTokens();
  const size = 152;
  const pressScale = useRef(new Animated.Value(1)).current;
  const rippleProgress = useRef(new Animated.Value(0)).current;
  const [rippleOrigin, setRippleOrigin] = useState({ x: size / 2, y: size / 2 });

  const beginRipple = (event) => {
    const x = event?.nativeEvent?.locationX;
    const y = event?.nativeEvent?.locationY;

    if (Number.isFinite(x) && Number.isFinite(y)) {
      setRippleOrigin({ x, y });
    }

    rippleProgress.stopAnimation();
    rippleProgress.setValue(0);
    Animated.timing(rippleProgress, {
      toValue: 1,
      duration: theme.motion.tapRippleMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.spring(pressScale, {
      toValue: 0.968,
      damping: 18,
      stiffness: 230,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  };

  const releaseRipple = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      damping: 16,
      stiffness: 190,
      mass: 0.78,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Preview selected theme ripple"
      accessibilityHint="Shows how the selected atmosphere changes the fluid Circle"
      onPressIn={beginRipple}
      onPressOut={releaseRipple}
      style={{ width: size, height: size }}
    >
      <FluidCircle
        size={size}
        pressScale={pressScale}
        rippleProgress={rippleProgress}
        rippleOrigin={rippleOrigin}
      />
    </Pressable>
  );
}

function PaletteSwatches({ themeId, selected }) {
  const optionTheme = getTheme(themeId);
  const swatches = optionTheme.circle.decalPalette.slice(0, 5);

  return (
    <View style={styles.swatchRow}>
      {swatches.map((color, index) => (
        <View
          key={`${themeId}-${color}-${index}`}
          style={[
            styles.swatch,
            {
              backgroundColor: color,
              borderColor: selected
                ? optionTheme.circle.accent
                : 'rgba(10,18,34,0.08)',
            },
          ]}
        />
      ))}
    </View>
  );
}


function ThemeVisualPreview({ themeId, large = false }) {
  const optionTheme = getTheme(themeId);
  const tokens = optionTheme.navigation?.aero || {};
  const isAero = optionTheme.navigation?.tabStation === 'aero-grass';
  const sway = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isAero) return undefined;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, {
          toValue: 1,
          duration: 2300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          toValue: 0,
          duration: 2700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isAero, sway]);

  const field = useMemo(
    () => Array.from({ length: large ? 54 : 34 }, (_, index) => ({
      left: `${4 + ((index * 17) % 93)}%`,
      bottom: 5 + ((index * 7) % (large ? 16 : 12)),
      size: 1.1 + ((index * 5) % 3) * 0.35,
      opacity: 0.3 + ((index * 11) % 4) * 0.08,
      group: index % 3,
    })),
    [large]
  );

  const fieldColors = [
    tokens.grassLight || optionTheme.circle.decalPalette[1] || '#DDF6AF',
    tokens.grassMid || optionTheme.circle.decalPalette[0] || '#A6E17B',
    tokens.grassDark || optionTheme.circle.accent || '#70BE64',
  ];
  const swayX = sway.interpolate({ inputRange: [0, 1], outputRange: [-1.4, 1.4] });

  return (
    <View
      pointerEvents="none"
      style={[
        styles.themePreview,
        large && styles.themePreviewLarge,
        {
          backgroundColor: optionTheme.welcome?.portalBackground?.[0] || optionTheme.colors.bg,
          borderColor: optionTheme.colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.previewOrb,
          styles.previewOrbOne,
          { backgroundColor: `${optionTheme.circle.decalPalette[0]}55` },
        ]}
      />
      <View
        style={[
          styles.previewOrb,
          styles.previewOrbTwo,
          { backgroundColor: `${optionTheme.circle.decalPalette[2]}46` },
        ]}
      />
      <View
        style={[
          styles.previewOrb,
          styles.previewOrbThree,
          { backgroundColor: `${optionTheme.circle.decalPalette[3]}42` },
        ]}
      />

      <View
        style={[
          styles.miniStation,
          large && styles.miniStationLarge,
          {
            backgroundColor: isAero
              ? tokens.stationBottom || optionTheme.circle.accentSoft
              : optionTheme.colors.surface,
            borderColor: isAero
              ? tokens.stationBorder || optionTheme.colors.border
              : optionTheme.colors.border,
          },
        ]}
      >
        {isAero ? (
          <View style={styles.miniField}>
            {field.map((particle, index) => (
              <Animated.View
                key={`${themeId}-field-${index}`}
                style={[
                  styles.miniFieldParticle,
                  {
                    left: particle.left,
                    bottom: particle.bottom,
                    width: particle.size,
                    height: particle.size * 2.4,
                    opacity: particle.opacity,
                    backgroundColor: fieldColors[particle.group],
                    transform: [
                      {
                        translateX: particle.group === 1
                          ? Animated.multiply(swayX, -0.7)
                          : swayX,
                      },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.miniTabs}>
          {[0, 1, 2, 3].map((index) => (
            <View
              key={`${themeId}-tab-${index}`}
              style={[
                styles.miniTabOrb,
                large && styles.miniTabOrbLarge,
                {
                  backgroundColor: index === 0
                    ? optionTheme.circle.accentSoft
                    : optionTheme.colors.surface,
                  borderColor: index === 0
                    ? optionTheme.circle.accent
                    : optionTheme.colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.miniTabCore,
                  large && styles.miniTabCoreLarge,
                  {
                    backgroundColor: index === 0
                      ? optionTheme.circle.accent
                      : optionTheme.colors.subtext,
                  },
                ]}
              />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function AppearanceScreen({ navigation }) {
  const theme = useThemeTokens();
  const {
    savedThemeId,
    setThemeId,
    restoreSavedTheme,
    saveThemeId,
  } = useTheme();
  const [selectedThemeId, setSelectedThemeId] = useState(savedThemeId);
  const [saving, setSaving] = useState(false);
  const savedThemeRef = useRef(savedThemeId);
  const themedStyles = useMemo(() => createThemedStyles(theme), [theme]);

  useEffect(() => {
    savedThemeRef.current = savedThemeId;
  }, [savedThemeId]);

  useEffect(() => {
    setSelectedThemeId(savedThemeRef.current);
    setThemeId(savedThemeRef.current);

    return () => {
      restoreSavedTheme();
    };
  }, [restoreSavedTheme, setThemeId]);

  const hasPendingChange = selectedThemeId !== savedThemeId;

  const selectTheme = (themeId) => {
    setSelectedThemeId(themeId);
    setThemeId(themeId);
  };

  const applyTheme = async () => {
    if (!hasPendingChange || saving) return;

    setSaving(true);
    try {
      const persistedThemeId = await saveThemeId(selectedThemeId);
      setSelectedThemeId(persistedThemeId);
    } catch (error) {
      Alert.alert(
        'Could not save theme',
        error?.message || 'Your current theme was kept. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={themedStyles.screen}>
      <FloatingCircleField variant="portal" />
      <SafeAreaView edges={['top']} style={themedStyles.safeArea}>
        <View style={themedStyles.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={themedStyles.topBarSide}
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </Pressable>
          <Text style={themedStyles.topBarTitle}>Appearance</Text>
          <View style={themedStyles.topBarSide} />
        </View>

        <ScrollView
          contentContainerStyle={themedStyles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={themedStyles.title}>Make Circles feel like yours.</Text>
          <Text style={themedStyles.subtitle}>
            Your global theme shapes your personal Circles experience. Shared
            Circles can still choose their own look without changing yours.
          </Text>

          <View style={themedStyles.scopeRow}>
            <View style={themedStyles.scopeCard}>
              <View style={themedStyles.scopeIcon}>
                <Ionicons name="phone-portrait-outline" size={17} color={theme.circle.accent} />
              </View>
              <View style={themedStyles.scopeTextWrap}>
                <Text style={themedStyles.scopeTitle}>Your app</Text>
                <Text style={themedStyles.scopeBody}>Welcome, tabs, Feed, Mutuals, Circles, and Me.</Text>
              </View>
            </View>
            <View style={themedStyles.scopeCard}>
              <View style={themedStyles.scopeIcon}>
                <Ionicons name="people-circle-outline" size={18} color={theme.circle.accent} />
              </View>
              <View style={themedStyles.scopeTextWrap}>
                <Text style={themedStyles.scopeTitle}>Shared Circles</Text>
                <Text style={themedStyles.scopeBody}>Can inherit yours or use a shared Circle theme.</Text>
              </View>
            </View>
          </View>

          <View style={themedStyles.heroCard}>
            <View style={themedStyles.heroGlow} />
            <ThemeSampleCircle />
            <Text style={themedStyles.heroThemeName}>{theme.name}</Text>
            <Text style={themedStyles.heroThemeDescription}>
              {theme.description}
            </Text>
            <ThemeVisualPreview themeId={selectedThemeId} large />
            <Text style={themedStyles.heroHint}>Tap the Circle to test the water.</Text>
          </View>

          <Pressable
            onPress={() => navigation.navigate('AppearanceWelcomePreview')}
            style={({ pressed }) => [
              themedStyles.previewAction,
              pressed && themedStyles.pressed,
            ]}
          >
            <Ionicons name="play-outline" size={20} color={theme.colors.text} />
            <Text style={themedStyles.previewActionText}>Preview full welcome</Text>
          </Pressable>

          <Text style={themedStyles.sectionLabel}>ATMOSPHERES</Text>
          <View style={themedStyles.themeList}>
            {THEME_OPTIONS.map((option, index) => {
              const selected = option.id === selectedThemeId;
              const applied = option.id === savedThemeId;
              const optionTheme = getTheme(option.id);

              return (
                <View key={option.id}>
                  {index > 0 ? <View style={themedStyles.separator} /> : null}
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => selectTheme(option.id)}
                    style={({ pressed }) => [
                      themedStyles.themeRow,
                      selected && {
                        backgroundColor: optionTheme.circle.accentSoft,
                      },
                      pressed && themedStyles.pressed,
                    ]}
                  >
                    <ThemeVisualPreview themeId={option.id} />

                    <View style={themedStyles.themeText}>
                      <View style={themedStyles.themeTitleRow}>
                        <Text style={themedStyles.themeName}>{option.name}</Text>
                        {applied ? (
                          <View style={themedStyles.appliedBadge}>
                            <Text style={themedStyles.appliedBadgeText}>APPLIED</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={themedStyles.themeDescription}>
                        {option.description}
                      </Text>
                      <PaletteSwatches themeId={option.id} selected={selected} />
                      <Text style={themedStyles.themeMode}>
                        {optionTheme.navigation?.tabStation === 'aero-grass'
                          ? 'Living particle tab station'
                          : 'Clean standard tab bar'}
                      </Text>
                    </View>

                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={selected ? optionTheme.circle.accent : theme.colors.subtext}
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>

          <Pressable
            onPress={() => selectTheme(DEFAULT_THEME_ID)}
            disabled={selectedThemeId === DEFAULT_THEME_ID}
            style={({ pressed }) => [
              themedStyles.resetAction,
              selectedThemeId === DEFAULT_THEME_ID && themedStyles.disabled,
              pressed && selectedThemeId !== DEFAULT_THEME_ID && themedStyles.pressed,
            ]}
          >
            <Ionicons name="refresh-outline" size={18} color={theme.colors.text} />
            <Text style={themedStyles.resetActionText}>Select Default</Text>
          </Pressable>

          <Pressable
            onPress={applyTheme}
            disabled={!hasPendingChange || saving}
            style={({ pressed }) => [
              themedStyles.applyAction,
              (!hasPendingChange || saving) && themedStyles.applyActionDisabled,
              pressed && hasPendingChange && !saving && themedStyles.pressed,
            ]}
          >
            <Ionicons
              name={hasPendingChange ? 'sparkles-outline' : 'checkmark-circle-outline'}
              size={20}
              color={theme.colors.onPrimary}
            />
            <Text style={themedStyles.applyActionText}>
              {saving
                ? 'Saving…'
                : hasPendingChange
                  ? `Apply ${getTheme(selectedThemeId).name}`
                  : `${getTheme(savedThemeId).name} is applied`}
            </Text>
          </Pressable>

          <View style={themedStyles.noteCard}>
            <Ionicons
              name="cloud-done-outline"
              size={20}
              color={theme.colors.text}
            />
            <Text style={themedStyles.noteText}>
              Your global theme follows your account and restores before the
              welcome portal appears. Circle-specific themes stay scoped to that
              shared space, so they never overwrite this preference.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export function AppearanceWelcomePreviewScreen({ navigation }) {
  const theme = useThemeTokens();

  return (
    <View style={{ flex: 1, backgroundColor: theme.welcome.portalBackground[0] }}>
      <LaunchPortal onComplete={() => navigation.goBack()} />
    </View>
  );
}

function createThemedStyles(theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.welcome.portalBackground[0],
    },
    safeArea: {
      flex: 1,
    },
    topBar: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    topBarSide: {
      width: 52,
      height: 42,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    topBarTitle: {
      flex: 1,
      textAlign: 'center',
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 16,
    },
    content: {
      width: '100%',
      maxWidth: 700,
      alignSelf: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.lg,
      paddingBottom: 54,
    },
    title: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 30,
      lineHeight: 36,
      letterSpacing: -0.8,
    },
    subtitle: {
      marginTop: 9,
      maxWidth: 580,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 14,
      lineHeight: 21,
    },
    scopeRow: {
      marginTop: 16,
      flexDirection: 'row',
      gap: 10,
    },
    scopeCard: {
      flex: 1,
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
      padding: 12,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    scopeIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.accentSoft,
    },
    scopeTextWrap: {
      flex: 1,
    },
    scopeTitle: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 12.5,
    },
    scopeBody: {
      marginTop: 2,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 10.5,
      lineHeight: 15,
    },
    heroCard: {
      marginTop: 22,
      alignItems: 'center',
      overflow: 'hidden',
      paddingHorizontal: 24,
      paddingTop: 30,
      paddingBottom: 23,
      borderRadius: theme.radii.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      shadowColor: theme.fluid.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 2,
    },
    heroGlow: {
      position: 'absolute',
      top: -90,
      width: 310,
      height: 250,
      borderRadius: 155,
      backgroundColor: theme.circle.accentSoft,
      opacity: 0.56,
    },
    heroThemeName: {
      marginTop: 20,
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 20,
      letterSpacing: -0.35,
    },
    heroThemeDescription: {
      marginTop: 5,
      maxWidth: 390,
      textAlign: 'center',
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 13,
      lineHeight: 19,
    },
    heroHint: {
      marginTop: 10,
      color: theme.circle.accent,
      fontFamily: theme.typography.semibold,
      fontSize: 12,
    },
    previewAction: {
      minHeight: 50,
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    previewActionText: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 14,
    },
    sectionLabel: {
      marginTop: 28,
      marginLeft: 4,
      marginBottom: 8,
      color: theme.colors.subtext,
      fontFamily: theme.typography.bold,
      fontSize: 11,
      letterSpacing: 0.7,
    },
    themeList: {
      overflow: 'hidden',
      borderRadius: theme.radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    themeRow: {
      minHeight: 126,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    themeText: {
      flex: 1,
      paddingLeft: 12,
      paddingRight: 10,
    },
    themeTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 7,
    },
    themeName: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 15,
    },
    appliedBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.text,
    },
    appliedBadgeText: {
      color: theme.colors.bg,
      fontFamily: theme.typography.bold,
      fontSize: 8,
      letterSpacing: 0.7,
    },
    themeDescription: {
      marginTop: 4,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 12,
      lineHeight: 17,
    },
    themeMode: {
      marginTop: 7,
      color: theme.circle.accent,
      fontFamily: theme.typography.semibold,
      fontSize: 10.5,
      lineHeight: 14,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 116,
      backgroundColor: theme.colors.border,
    },
    resetAction: {
      minHeight: 48,
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    resetActionText: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 13,
    },
    applyAction: {
      minHeight: 52,
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.primary,
    },
    applyActionDisabled: {
      opacity: 0.46,
    },
    applyActionText: {
      color: theme.colors.onPrimary,
      fontFamily: theme.typography.bold,
      fontSize: 14,
    },
    noteCard: {
      marginTop: 18,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 14,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    noteText: {
      flex: 1,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 12,
      lineHeight: 18,
    },
    disabled: {
      opacity: 0.45,
    },
    pressed: {
      opacity: 0.72,
    },
  });
}

const styles = StyleSheet.create({
  swatchRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 9,
  },
  swatch: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  themePreview: {
    width: 94,
    height: 82,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  themePreviewLarge: {
    width: 230,
    height: 94,
    marginTop: 16,
    borderRadius: 22,
  },
  previewOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  previewOrbOne: {
    width: 34,
    height: 34,
    top: 7,
    left: 8,
  },
  previewOrbTwo: {
    width: 26,
    height: 26,
    top: 12,
    right: 9,
  },
  previewOrbThree: {
    width: 18,
    height: 18,
    top: 34,
    left: '46%',
  },
  miniStation: {
    position: 'absolute',
    left: 5,
    right: 5,
    bottom: 5,
    height: 31,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  miniStationLarge: {
    left: 9,
    right: 9,
    bottom: 8,
    height: 36,
    borderRadius: 17,
  },
  miniField: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  miniFieldParticle: {
    position: 'absolute',
    borderRadius: 2,
  },
  miniTabs: {
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: '100%',
    paddingHorizontal: 5,
  },
  miniTabOrb: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTabOrbLarge: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  miniTabCore: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.78,
  },
  miniTabCoreLarge: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
