import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { IS_DEVELOPMENT } from '../../config/env';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { MonoRingWithRipples } from '../../components/MonoRingWithRipples';
import { FloatingCircleField } from '../../components/FloatingCircleField';

const VALUES = [
  ['people-outline', 'Your real people'],
  ['ellipse-outline', 'Your private Circles'],
  ['calendar-outline', 'Plans that become memories'],
];

export function WelcomeScreen({ route, navigation }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const inviteToken = route?.params?.inviteToken || null;
  const eventGuestToken = route?.params?.eventGuestToken || null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <FloatingCircleField variant="auth" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandMark} />
          <Text style={styles.brand}>Circles</Text>
        </View>

        <View style={styles.hero}>
          <MonoRingWithRipples size={126} />
          <Text style={styles.title}>Social, for the people you actually know.</Text>
          <Text style={styles.subtitle}>
            No followers. No public search. Just the people, plans, and memories that belong in your life.
          </Text>
        </View>

        <View style={styles.valueList}>
          {VALUES.map(([icon, label]) => (
            <View key={label} style={styles.valueRow}>
              <View style={styles.valueIcon}>
                <Ionicons name={icon} size={18} color={theme.colors.text} />
              </View>
              <Text style={styles.valueText}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => navigation.navigate('AuthEmail', {
              inviteToken,
              eventGuestToken,
            })}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>Continue with email</Text>
            <Ionicons name="arrow-forward" size={19} color={theme.colors.onPrimary} />
          </Pressable>

          {IS_DEVELOPMENT ? (
            <Pressable
              onPress={() => navigation.navigate('DevSignIn', {
                inviteToken,
                eventGuestToken,
              })}
              style={({ pressed }) => [styles.devButton, pressed && styles.pressed]}
            >
              <Ionicons name="flask-outline" size={17} color={theme.colors.subtext} />
              <Text style={styles.devButtonText}>Development accounts</Text>
            </Pressable>
          ) : null}

          <Text style={styles.legal}>
            By continuing, you agree to use Circles respectfully and keep other people’s private moments private.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    overflow: 'hidden',
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
    zIndex: 2,
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
    borderColor: theme.welcome.brandInk,
  },
  brand: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    letterSpacing: -0.4,
  },
  hero: {
    flexGrow: 1,
    minHeight: 286,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 30,
    paddingBottom: 28,
  },
  title: {
    marginTop: 30,
    maxWidth: 430,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 36,
    lineHeight: 41,
    letterSpacing: -1.35,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 16,
    maxWidth: 410,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  valueList: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 380,
    marginBottom: 18,
  },
  valueRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  valueText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
  },
  actions: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    paddingHorizontal: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: theme.colors.onPrimary,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  devButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 5,
  },
  devButtonText: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  legal: {
    color: theme.colors.legal,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 3,
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.68,
  },
  });
}
