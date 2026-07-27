import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEV_BYPASS_CODE, IS_DEVELOPMENT } from '../../config/env';
import { supabase } from '../../lib/supabase';
import { ensureDevSession } from '../../services/authService';
import { redeemAppInvite } from '../../services/inviteService';
import { claimEventGuestAttendance } from '../../services/eventGuestInviteService';
import {
  fetchMyEditableProfile,
  isProfileIdentityComplete,
} from '../../services/profileService';
import {
  replaceWithClaimedEvent,
  replaceWithGuestClaimProfileSetup,
} from '../../navigation/navigationActions';
import { authStyles } from './authStyles';

export function AuthOtpScreen({ route, navigation }) {
  const { phone, inviteToken, eventGuestToken } = route.params || {};

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);


  const finishAfterAuthentication = async () => {
    let inviteResult = null;
    let inviteError = '';

    if (inviteToken) {
      try {
        inviteResult = await redeemAppInvite(inviteToken);
      } catch (error) {
        inviteError = error?.message || 'The invitation could not be applied.';
      }
    }

    if (eventGuestToken) {
      const profile = await fetchMyEditableProfile();

      if (!isProfileIdentityComplete(profile)) {
        replaceWithGuestClaimProfileSetup(navigation, eventGuestToken);
        return;
      }

      const eventClaimResult = await claimEventGuestAttendance(eventGuestToken);
      replaceWithClaimedEvent(navigation, eventClaimResult);
      return;
    }

    navigation.replace('ContactsIntro', {
      inviteResult,
      inviteError,
      eventClaimResult: null,
      eventClaimError: '',
    });
  };

  const onVerify = async () => {
    const token = code.trim();

    if (!token) {
      Alert.alert('Code required', 'Enter the six-digit verification code.');
      return;
    }

    setLoading(true);

    try {
      if (IS_DEVELOPMENT && token === DEV_BYPASS_CODE) {
        const session = await ensureDevSession(phone);

        if (!session?.user) {
          throw new Error(
            'The development account could not sign in. Check the development credentials and confirm Email auth is enabled in Supabase.'
          );
        }

        await finishAfterAuthentication();
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (error) throw error;

      if (!data?.session?.user) {
        throw new Error('Verification succeeded, but no session was created.');
      }

      const { error: ensureError } = await supabase.rpc('ensure_user', {
        phone,
      });

      if (ensureError) throw ensureError;

      await finishAfterAuthentication();
    } catch (error) {
      Alert.alert(
        'Verification failed',
        error?.message || 'Invalid or expired code.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={authStyles.root} edges={['top']}>
      <Text style={authStyles.title}>Enter the code</Text>

      <Text style={authStyles.caption}>
        {IS_DEVELOPMENT
          ? `Development login for ${phone || 'this device'}`
          : `We sent an SMS to ${phone}`}
      </Text>

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        maxLength={6}
        style={authStyles.input}
      />

      <Pressable
        style={authStyles.primaryButton}
        onPress={onVerify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={authStyles.primaryButtonText}>Verify</Text>
        )}
      </Pressable>

      <Pressable
        style={{ marginTop: 12 }}
        onPress={() => navigation.replace('AuthPhone', { inviteToken, eventGuestToken })}
      >
        <Text style={authStyles.linkText}>Use a different number</Text>
      </Pressable>
    </SafeAreaView>
  );
}
