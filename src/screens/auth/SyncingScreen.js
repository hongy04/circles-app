import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../../theme/colors';
import { replaceAfterOnboarding } from '../../navigation/navigationActions';

export function SyncingScreen({ route, navigation }) {
  const summary = route.params?.summary || {};
  const eventClaimResult = route.params?.eventClaimResult || null;

  useEffect(() => {
    const timer = setTimeout(() => {
      replaceAfterOnboarding(navigation, eventClaimResult);
    }, 1100);

    return () => clearTimeout(timer);
  }, [eventClaimResult, navigation]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={38} color="#fff" />
        </View>
        <Text style={styles.title}>Your Circles are ready.</Text>
        <Text style={styles.caption}>
          {summary.uploaded ?? 0} contact number{Number(summary.uploaded || 0) === 1 ? '' : 's'} privately checked
          {Number(summary.mutuals || 0) > 0
            ? ` · ${summary.mutuals} mutual${Number(summary.mutuals) === 1 ? '' : 's'} found`
            : ''}.
        </Text>
        <View style={styles.loadingTrack}>
          <View style={styles.loadingFill} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 29,
    lineHeight: 35,
    letterSpacing: -0.8,
    textAlign: 'center',
    marginTop: 25,
  },
  caption: {
    maxWidth: 390,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
  },
  loadingTrack: {
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e7e7e7',
    overflow: 'hidden',
    marginTop: 28,
  },
  loadingFill: {
    width: '76%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: COLORS.text,
  },
});
