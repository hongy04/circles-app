import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../../theme/colors';
import { replaceAfterOnboarding } from '../../navigation/navigationActions';
import { completeContactsOnboarding } from '../../services/onboardingService';
import { authStyles } from './authStyles';

const PRIVACY_POINTS = [
  ['lock-closed-outline', 'Your address book is never visible to other people.'],
  ['git-compare-outline', 'We use private matching to find mutual contacts.'],
  ['person-remove-outline', 'You can exclude anyone before syncing.'],
];

export function ContactsIntroScreen({ route, navigation }) {
  const inviteResult = route?.params?.inviteResult || null;
  const inviteError = route?.params?.inviteError || '';
  const eventClaimResult = route?.params?.eventClaimResult || null;
  const eventClaimError = route?.params?.eventClaimError || '';
  const isWeb = Platform.OS === 'web';
  const [finishing, setFinishing] = useState(false);

  const finishWithoutSync = async (choice = 'skipped') => {
    setFinishing(true);
    try {
      await completeContactsOnboarding(choice);
      replaceAfterOnboarding(navigation, eventClaimResult);
    } catch (error) {
      Alert.alert(
        'Could not finish setup',
        error?.message || 'Please try again.'
      );
    } finally {
      setFinishing(false);
    }
  };

  const continueFromIntro = () => {
    if (isWeb) {
      finishWithoutSync('unavailable');
      return;
    }

    navigation.navigate('ContactsPicker', { eventClaimResult });
  };

  return (
    <SafeAreaView style={authStyles.root} edges={['top', 'bottom']}>
      <View style={authStyles.scrollContent}>
        <View style={styles.progressRow}>
          <View style={[styles.progressSegment, styles.progressSegmentActive]} />
          <View style={[styles.progressSegment, styles.progressSegmentActive]} />
        </View>

        <Text style={authStyles.stepText}>Step 2 of 2</Text>
        <Text style={authStyles.title}>Find the people already in your life.</Text>
        <Text style={authStyles.caption}>
          Circles works through mutual contact—not public search or follower recommendations.
        </Text>

        <View style={styles.illustration}>
          <View style={[styles.personBubble, styles.personBubbleLeft]}>
            <Ionicons name="person" size={25} color={COLORS.text} />
          </View>
          <View style={styles.connectionLine} />
          <View style={styles.centerRing}>
            <View style={styles.centerRingInner} />
          </View>
          <View style={styles.connectionLine} />
          <View style={[styles.personBubble, styles.personBubbleRight]}>
            <Ionicons name="person" size={25} color={COLORS.text} />
          </View>
        </View>

        <View style={styles.privacyCard}>
          {PRIVACY_POINTS.map(([icon, label], index) => (
            <View key={label}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.privacyRow}>
                <View style={styles.privacyIcon}>
                  <Ionicons name={icon} size={18} color={COLORS.text} />
                </View>
                <Text style={styles.privacyText}>{label}</Text>
              </View>
            </View>
          ))}
        </View>

        {isWeb ? (
          <View style={authStyles.webNotice}>
            <Text style={styles.noticeTitle}>Continue on mobile later</Text>
            <Text style={styles.noticeBody}>
              Browsers cannot access your phone’s native contacts. You can sync from Settings after installing Circles on your phone.
            </Text>
          </View>
        ) : null}

        {inviteResult ? (
          <View style={authStyles.webNotice}>
            <Text style={styles.noticeTitle}>Invitation ready</Text>
            <Text style={styles.noticeBody}>
              {inviteResult.kind === 'circle'
                ? `Your invitation to ${inviteResult.circleName} is ready.`
                : `${inviteResult.inviterName}'s connection request is ready.`}
            </Text>
          </View>
        ) : null}

        {inviteError ? (
          <View style={[authStyles.webNotice, styles.errorNotice]}>
            <Text style={styles.noticeTitle}>Invitation needs attention</Text>
            <Text style={styles.noticeBody}>{inviteError}</Text>
          </View>
        ) : null}

        {eventClaimResult ? (
          <View style={authStyles.webNotice}>
            <Text style={styles.noticeTitle}>Event linked</Text>
            <Text style={styles.noticeBody}>
              {eventClaimResult.eventTitle} is linked to your account. You’ll be able to see confirmed attendees after setup.
            </Text>
          </View>
        ) : null}

        {eventClaimError ? (
          <View style={[authStyles.webNotice, styles.errorNotice]}>
            <Text style={styles.noticeTitle}>Event could not be linked</Text>
            <Text style={styles.noticeBody}>{eventClaimError}</Text>
          </View>
        ) : null}

        <View style={{ flex: 1, minHeight: 18 }} />

        <Pressable
          onPress={continueFromIntro}
          disabled={finishing}
          style={({ pressed }) => [
            authStyles.primaryButton,
            finishing && authStyles.primaryButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          {finishing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={authStyles.primaryButtonText}>
              {isWeb ? 'Continue to Circles' : 'Choose contacts'}
            </Text>
          )}
        </Pressable>

        {!isWeb ? (
          <Pressable
            onPress={() => finishWithoutSync('skipped')}
            disabled={finishing}
            style={authStyles.linkButton}
          >
            <Text style={authStyles.linkText}>Not now</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e7e7e7',
  },
  progressSegmentActive: {
    backgroundColor: COLORS.text,
  },
  illustration: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 28,
  },
  personBubble: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f3f3',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  personBubbleLeft: {
    transform: [{ translateY: 8 }],
  },
  personBubbleRight: {
    transform: [{ translateY: -8 }],
  },
  connectionLine: {
    width: 34,
    height: 1,
    backgroundColor: '#cfcfcf',
  },
  centerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerRingInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.text,
  },
  privacyCard: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: 18,
  },
  privacyRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  privacyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f4f4f4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  privacyText: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    lineHeight: 19,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: 62,
  },
  noticeTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  noticeBody: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  errorNotice: {
    borderColor: '#e5b9b4',
    backgroundColor: '#fff8f7',
  },
  pressed: {
    opacity: 0.68,
  },
});
