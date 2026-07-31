import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
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
import {
  continueAfterProfile,
  getMyOnboardingState,
} from '../../services/onboardingService';
import {
  replaceWithAccountStatus,
  replaceWithMainTabs,
} from '../../navigation/navigationActions';
import { getMyAccountEnforcementState } from '../../services/accountEnforcementService';
import { authStyles } from './authStyles';

const RESEND_SECONDS = 60;
const OTP_INPUT_ACCESSORY_ID = 'auth-otp-accessory';

function friendlyVerificationError(error) {
  const message = error?.message || '';
  if (/expired/i.test(message)) return 'That code expired. Request a new one.';
  if (/invalid|token/i.test(message)) return 'That code is not correct. Try again.';
  if (/rate limit|too many|security purposes/i.test(message)) {
    return 'Too many attempts. Wait a little before trying again.';
  }
  return message || 'The code could not be verified.';
}

function friendlyResendError(error) {
  const message = error?.message || '';
  if (/rate limit|too many|security purposes/i.test(message)) {
    return 'A code was sent recently. Wait a little before requesting another one.';
  }
  return message || 'Wait a little and try again.';
}

export function AuthOtpScreen({ route, navigation }) {
  const {
    email,
    displayEmail,
    inviteToken,
    eventGuestToken,
  } = route.params || {};

  const inputRef = useRef(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const finishAfterAuthentication = async () => {
    const enforcement = await getMyAccountEnforcementState();

    if (enforcement.active && enforcement.state === 'suspended') {
      replaceWithAccountStatus(navigation);
      return;
    }

    if (enforcement.active && enforcement.state === 'restricted') {
      replaceWithMainTabs(navigation);
      return;
    }

    const onboarding = await getMyOnboardingState();

    if (!onboarding.profileCompleted) {
      navigation.replace('ProfileSetup', {
        inviteToken,
        eventGuestToken,
      });
      return;
    }

    await continueAfterProfile({
      navigation,
      inviteToken,
      eventGuestToken,
    });
  };

  const onVerify = async () => {
    Keyboard.dismiss();

    const token = code.trim();

    if (!email) {
      Alert.alert(
        'Email missing',
        'Go back and enter your email address again.'
      );
      return;
    }

    if (token.length !== 6) {
      Alert.alert('Enter all six digits', 'Use the code sent to your email.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });

      if (error) throw error;
      if (!data?.session?.user) {
        throw new Error('Verification succeeded, but no session was created.');
      }

      const { error: ensureError } = await supabase.rpc('ensure_my_user');
      if (ensureError) throw ensureError;

      await finishAfterAuthentication();
    } catch (error) {
      Alert.alert('Verification failed', friendlyVerificationError(error));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (secondsLeft > 0 || resending || !email) return;

    setResending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setCode('');
      setSecondsLeft(RESEND_SECONDS);
      inputRef.current?.focus();
    } catch (error) {
      Alert.alert('Could not resend code', friendlyResendError(error));
    } finally {
      setResending(false);
    }
  };

  const onChangeCode = (value) => {
    const nextCode = value.replace(/\D/g, '').slice(0, 6);
    setCode(nextCode);

    if (nextCode.length === 6) {
      Keyboard.dismiss();
    }
  };

  const digits = Array.from({ length: 6 }, (_, index) => code[index] || '');

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
            <Text style={authStyles.topBarTitle}>Verify your email</Text>
            <View style={authStyles.topBarSide} />
          </View>

          <Text style={authStyles.stepText}>Secure sign-in</Text>
          <Text style={authStyles.title}>Enter the code</Text>
          <Text style={authStyles.caption}>
            We sent a six-digit code to {displayEmail || email}.
          </Text>

          <Pressable
            onPress={() => inputRef.current?.focus()}
            style={styles.codeRow}
          >
            {digits.map((digit, index) => (
              <View
                key={index}
                style={[
                  styles.codeBox,
                  index === code.length && code.length < 6 && styles.codeBoxActive,
                  digit && styles.codeBoxFilled,
                ]}
              >
                <Text style={styles.codeDigit}>{digit}</Text>
              </View>
            ))}
          </Pressable>

          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChangeCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            inputAccessoryViewID={Platform.OS === 'ios' ? OTP_INPUT_ACCESSORY_ID : undefined}
            onSubmitEditing={Keyboard.dismiss}
            caretHidden
            style={styles.hiddenInput}
          />

          <Pressable
            onPress={onVerify}
            disabled={loading || code.length !== 6}
            style={({ pressed }) => [
              authStyles.primaryButton,
              (loading || code.length !== 6) && authStyles.primaryButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={authStyles.primaryButtonText}>Verify and continue</Text>
            )}
          </Pressable>

          <View style={styles.resendRow}>
            <Text style={styles.resendPrompt}>Didn’t receive it?</Text>
            <Pressable
              onPress={onResend}
              disabled={secondsLeft > 0 || resending}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.resendLink,
                  secondsLeft > 0 && styles.resendLinkDisabled,
                ]}
              >
                {resending
                  ? 'Sending…'
                  : secondsLeft > 0
                    ? `Resend in ${secondsLeft}s`
                    : 'Resend code'}
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={authStyles.linkButton}
            onPress={() => navigation.navigate('AuthEmail', {
              inviteToken,
              eventGuestToken,
            })}
          >
            <Text style={authStyles.linkText}>Use a different email</Text>
          </Pressable>
        </ScrollView>

        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={OTP_INPUT_ACCESSORY_ID}>
            <View style={styles.keyboardAccessory}>
              <Pressable
                onPress={Keyboard.dismiss}
                hitSlop={8}
                style={styles.keyboardDoneButton}
              >
                <Text style={styles.keyboardDoneText}>Done</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  keyboardAccessory: {
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: '#f7f7f7',
  },
  keyboardDoneButton: {
    minWidth: 54,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardDoneText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 32,
  },
  codeBox: {
    flex: 1,
    maxWidth: 58,
    aspectRatio: 0.86,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  codeBoxActive: {
    borderColor: COLORS.text,
    borderWidth: 1.5,
  },
  codeBoxFilled: {
    backgroundColor: '#f7f7f7',
  },
  codeDigit: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 24,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: 18,
  },
  resendPrompt: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
  },
  resendLink: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  resendLinkDisabled: {
    color: '#9a9a9a',
  },
  pressed: {
    opacity: 0.68,
  },
});
