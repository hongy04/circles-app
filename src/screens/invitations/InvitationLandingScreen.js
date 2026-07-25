import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '../../components/Avatar';
import { MonoRingWithRipples } from '../../components/MonoRingWithRipples';
import { COLORS } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import {
  previewAppInvite,
  redeemAppInvite,
} from '../../services/inviteService';

function unavailableMessage(reason) {
  switch (reason) {
    case 'expired':
      return 'This invitation has expired. Ask the sender for a new link.';
    case 'revoked':
      return 'This invitation is no longer active.';
    case 'used_up':
      return 'This invitation has reached its limit.';
    case 'circle_unavailable':
      return 'This Circle is no longer available.';
    case 'inviter_no_longer_can_invite':
      return 'The sender can no longer invite people to this Circle.';
    default:
      return 'This invitation could not be found or is no longer available.';
  }
}

function resultCopy(result) {
  if (!result) return '';

  if (result.kind === 'circle') {
    if (result.outcome === 'already_member') {
      return `You are already a member of ${result.circleName}.`;
    }

    if (result.outcome === 'circle_invitation_exists') {
      return `An invitation to ${result.circleName} is already waiting for you in Circles.`;
    }

    return `Your invitation to ${result.circleName} is ready. Review it in Circles before joining.`;
  }

  if (result.outcome === 'already_connected') {
    return `You and ${result.inviterName} are already connected.`;
  }

  if (result.outcome === 'request_exists') {
    return `A connection request between you and ${result.inviterName} is already waiting.`;
  }

  return `${result.inviterName}'s connection request is ready. Review it in Mutuals before connecting.`;
}

export function InvitationLandingScreen({ route, navigation }) {
  const token = route.params?.token || '';
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState('');

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      setPreview(await previewAppInvite(token));
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this invitation.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const continueWithInvite = async () => {
    if (!preview?.valid || redeeming) return;
    setRedeeming(true);
    setError('');

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session) {
        navigation.replace('Auth', { inviteToken: token });
        return;
      }

      setResult(await redeemAppInvite(token));
    } catch (redeemError) {
      setError(redeemError?.message || 'Could not apply this invitation.');
    } finally {
      setRedeeming(false);
    }
  };

  const openCircles = () => {
    const targetTab = result?.kind === 'personal' ? 'Mutuals' : 'Circles';
    navigation.replace('MainTabs', {
      screen: targetTab,
      params: result?.kind === 'personal'
        ? { initialTab: 'requests' }
        : undefined,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Opening invitation…</Text>
      </SafeAreaView>
    );
  }

  if (result) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={34} color="#fff" />
          </View>
          <Text style={styles.title}>Invitation saved</Text>
          <Text style={styles.body}>{resultCopy(result)}</Text>
          <Pressable
            onPress={openCircles}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>Open Circles</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isCircle = preview?.kind === 'circle';
  const available = Boolean(preview?.valid);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <MonoRingWithRipples size={86} />

        {available ? (
          <>
            <Text style={styles.eyebrow}>CIRCLES INVITATION</Text>
            <Avatar
              size={70}
              name={preview.inviterName}
              uri={preview.inviterAvatar}
            />
            <Text style={styles.title}>
              {isCircle
                ? `${preview.inviterName} invited you to join ${preview.circleName}`
                : `${preview.inviterName} invited you to connect`}
            </Text>
            <Text style={styles.body}>
              {isCircle
                ? `Join a private Circle with ${preview.memberCount || 'their'} existing member${preview.memberCount === 1 ? '' : 's'}. You will still review the invitation before entering.`
                : 'Circles keeps profiles private. Joining creates a connection request that you can review before accepting.'}
            </Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              onPress={continueWithInvite}
              disabled={redeeming}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || redeeming) && styles.pressed,
              ]}
            >
              {redeeming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Continue to Circles</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.unavailableIcon}>
              <Ionicons name="link-outline" size={30} color={COLORS.text} />
            </View>
            <Text style={styles.title}>Invitation unavailable</Text>
            <Text style={styles.body}>
              {error || unavailableMessage(preview?.reason)}
            </Text>
            <Pressable
              onPress={() => navigation.replace('Gate')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>Open Circles</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 30,
  },
  eyebrow: {
    marginTop: 32,
    marginBottom: 16,
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 18,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 24,
    lineHeight: 31,
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 14,
    color: '#a61b12',
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    minHeight: 50,
    marginTop: 24,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  secondaryButton: {
    width: '100%',
    minHeight: 50,
    marginTop: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: { color: COLORS.text, fontFamily: 'Manrope_700Bold' },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#f1f1f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
