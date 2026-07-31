import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme/colors';
import { authStyles } from './authStyles';

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toFriendlyAuthError(error) {
  const message = error?.message || '';
  const code = error?.code || '';

  if (/rate limit|too many|security purposes/i.test(message)) {
    return 'Too many verification emails were requested. Wait a little and try again.';
  }

  if (
    code === 'email_provider_disabled'
    || /email.*disabled|provider.*disabled/i.test(message)
  ) {
    return __DEV__
      ? 'Email sign-in is not enabled in Supabase. Enable the Email provider under Authentication settings.'
      : 'Email sign-in is temporarily unavailable. Please try again later.';
  }

  if (/invalid.*email|email.*invalid/i.test(message)) {
    return 'Enter a valid email address and try again.';
  }

  return message || 'The verification email could not be sent.';
}

export function AuthEmailScreen({ route, navigation }) {
  const inviteToken = route?.params?.inviteToken || null;
  const eventGuestToken = route?.params?.eventGuestToken || null;
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const emailIsValid = isValidEmail(normalizedEmail);

  const onSendCode = async () => {
    Keyboard.dismiss();

    if (!emailIsValid) {
      Alert.alert(
        'Check your email',
        'Enter a valid email address before requesting a verification code.'
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });

      if (error) throw error;

      navigation.navigate('AuthOtp', {
        email: normalizedEmail,
        displayEmail: normalizedEmail,
        inviteToken,
        eventGuestToken,
      });
    } catch (error) {
      Alert.alert('Could not send code', toFriendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={authStyles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={authStyles.scrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={authStyles.topBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={10}
              style={authStyles.topBarSide}
            >
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            </Pressable>
            <Text style={authStyles.topBarTitle}>Email verification</Text>
            <View style={authStyles.topBarSide} />
          </View>

          <Text style={authStyles.stepText}>Your account</Text>
          <Text style={authStyles.title}>What’s your email?</Text>
          <Text style={authStyles.caption}>
            Circles uses your email for private sign-in and account access. It is never shown on your profile.
          </Text>

          <Text style={authStyles.inputLabel}>Email address</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="you@example.com"
            placeholderTextColor="#9a9a9a"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => {
              if (emailIsValid && !loading) onSendCode();
            }}
            autoFocus
            style={[
              authStyles.input,
              focused && authStyles.inputFocused,
            ]}
          />

          <Text style={authStyles.helperText}>
            We’ll email a six-digit code. Check your spam folder if it does not arrive.
          </Text>

          <Pressable
            onPress={onSendCode}
            disabled={loading || !emailIsValid}
            style={({ pressed }) => [
              authStyles.primaryButton,
              (loading || !emailIsValid) && authStyles.primaryButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={authStyles.primaryButtonText}>Send verification code</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  pressed: {
    opacity: 0.68,
  },
});
