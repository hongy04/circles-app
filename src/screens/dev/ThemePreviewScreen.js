import React, { useMemo, useRef, useState } from 'react';
import {
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
      accessibilityLabel="Preview theme ripple"
      accessibilityHint="Shows the selected theme's fluid Circle response"
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

export function ThemePreviewScreen({ navigation }) {
  const theme = useThemeTokens();
  const { themeId, setThemeId, resetTheme } = useTheme();
  const themedStyles = useMemo(() => createThemedStyles(theme), [theme]);

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
          <Text style={themedStyles.topBarTitle}>Theme Laboratory</Text>
          <View style={themedStyles.topBarSide} />
        </View>

        <ScrollView
          contentContainerStyle={themedStyles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={themedStyles.devBadge}>
            <Ionicons name="flask-outline" size={16} color={theme.colors.text} />
            <Text style={themedStyles.devBadgeText}>DEVELOPMENT PREVIEW</Text>
          </View>

          <Text style={themedStyles.title}>Choose the atmosphere.</Text>
          <Text style={themedStyles.subtitle}>
            Compare Circles' curated Frutiger Aero directions live. Changes are
            temporary and return to your saved Appearance choice when the app reloads.
          </Text>

          <View style={themedStyles.heroCard}>
            <View style={themedStyles.heroGlow} />
            <ThemeSampleCircle />
            <Text style={themedStyles.heroThemeName}>{theme.name}</Text>
            <Text style={themedStyles.heroThemeDescription}>
              {theme.description}
            </Text>
            <Text style={themedStyles.heroHint}>Tap the Circle to test the water.</Text>
          </View>

          <Pressable
            onPress={() => navigation.navigate('ThemeWelcomePreview')}
            style={({ pressed }) => [
              themedStyles.primaryAction,
              pressed && themedStyles.pressed,
            ]}
          >
            <Ionicons name="play-outline" size={20} color={theme.colors.onPrimary} />
            <Text style={themedStyles.primaryActionText}>Preview full welcome</Text>
          </Pressable>

          <Text style={themedStyles.sectionLabel}>CURATED THEMES</Text>
          <View style={themedStyles.themeList}>
            {THEME_OPTIONS.map((option, index) => {
              const selected = option.id === themeId;
              const optionTheme = getTheme(option.id);

              return (
                <View key={option.id}>
                  {index > 0 ? <View style={themedStyles.separator} /> : null}
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setThemeId(option.id)}
                    style={({ pressed }) => [
                      themedStyles.themeRow,
                      selected && {
                        backgroundColor: optionTheme.circle.accentSoft,
                      },
                      pressed && themedStyles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        themedStyles.themeMark,
                        {
                          backgroundColor: optionTheme.circle.accentSoft,
                          borderColor: optionTheme.circle.accent,
                        },
                      ]}
                    >
                      <View
                        style={[
                          themedStyles.themeMarkCore,
                          { backgroundColor: optionTheme.circle.accent },
                        ]}
                      />
                    </View>

                    <View style={themedStyles.themeText}>
                      <View style={themedStyles.themeTitleRow}>
                        <Text style={themedStyles.themeName}>{option.name}</Text>
                        {selected ? (
                          <View style={themedStyles.selectedBadge}>
                            <Text style={themedStyles.selectedBadgeText}>ACTIVE</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={themedStyles.themeDescription}>
                        {option.description}
                      </Text>
                      <PaletteSwatches themeId={option.id} selected={selected} />
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
            onPress={resetTheme}
            disabled={themeId === DEFAULT_THEME_ID}
            style={({ pressed }) => [
              themedStyles.resetAction,
              themeId === DEFAULT_THEME_ID && themedStyles.resetActionDisabled,
              pressed && themeId !== DEFAULT_THEME_ID && themedStyles.pressed,
            ]}
          >
            <Ionicons name="refresh-outline" size={18} color={theme.colors.text} />
            <Text style={themedStyles.resetActionText}>Reset to Default</Text>
          </Pressable>

          <View style={themedStyles.noteCard}>
            <Ionicons name="information-circle-outline" size={20} color={theme.colors.text} />
            <Text style={themedStyles.noteText}>
              This laboratory changes presentation only. It does not save a
              preference, update Supabase, or change Circle permissions. Use
              Settings → Appearance to apply a theme to your account.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export function ThemeWelcomePreviewScreen({ navigation }) {
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
    devBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: theme.radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    devBadgeText: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 10,
      letterSpacing: 1.15,
    },
    title: {
      marginTop: 18,
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 30,
      lineHeight: 36,
      letterSpacing: -0.8,
    },
    subtitle: {
      marginTop: 9,
      maxWidth: 560,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 14,
      lineHeight: 21,
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
      marginTop: 12,
      color: theme.circle.accent,
      fontFamily: theme.typography.semibold,
      fontSize: 12,
    },
    primaryAction: {
      minHeight: 50,
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.primary,
    },
    primaryActionText: {
      color: theme.colors.onPrimary,
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
      minHeight: 112,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    themeMark: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
      borderWidth: 1.5,
      marginRight: 13,
    },
    themeMarkCore: {
      width: 18,
      height: 18,
      borderRadius: 9,
      opacity: 0.8,
    },
    themeText: {
      flex: 1,
      paddingRight: 12,
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
    selectedBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.text,
    },
    selectedBadgeText: {
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
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 75,
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
    resetActionDisabled: {
      opacity: 0.45,
    },
    resetActionText: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 13,
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
});
