import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Localization from 'expo-localization';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { IS_DEVELOPMENT } from '../../config/env';
import { supabase } from '../../lib/supabase';
import { authStyles } from './authStyles';

function getRegionCode() {
  const locale = Localization.getLocales?.()?.[0];
  return locale?.regionCode || Localization?.region || 'US';
}

export function AuthPhoneScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const region = getRegionCode();

  const onSendCode = async () => {
    if (!phone.trim()) {
      Alert.alert('Phone required', 'Enter your phone number.');
      return;
    }

    setLoading(true);

    try {
      const parsed = parsePhoneNumberFromString(phone, region);
      const e164 = parsed?.isValid() ? parsed.number : phone.trim();

      if (IS_DEVELOPMENT) {
        navigation.replace('AuthOtp', { phone: e164 });
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        phone: e164,
      });

      if (error) throw error;

      navigation.replace('AuthOtp', { phone: e164 });
    } catch (error) {
      Alert.alert(
        'Could not send code',
        error?.message || 'Failed to send the verification code.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={authStyles.root} edges={['top']}>
      <Text style={authStyles.title}>Verify your phone</Text>

      <Text style={authStyles.caption}>
        We’ll text you a one-time code.
      </Text>

      {IS_DEVELOPMENT ? (
        <Text style={[authStyles.caption, { marginTop: 6 }]}>
          Development mode: no text will be sent. Enter 000000 on the next
          screen.
        </Text>
      ) : null}

      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 555 123 4567"
        keyboardType="phone-pad"
        autoComplete="tel"
        style={authStyles.input}
      />

      <Pressable
        style={authStyles.primaryButton}
        onPress={onSendCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={authStyles.primaryButtonText}>
            {IS_DEVELOPMENT ? 'Continue' : 'Send Code'}
          </Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}
