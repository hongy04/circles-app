import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import * as Localization from 'expo-localization';
import {
  AsYouType,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';

import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme/colors';
import { authStyles } from './authStyles';

const PHONE_INPUT_ACCESSORY_ID = 'auth-phone-number-accessory';

const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
];

function getInitialCountry() {
  const region = Localization.getLocales?.()?.[0]?.regionCode
    || Localization?.region
    || 'US';
  return COUNTRIES.find((country) => country.code === region) || COUNTRIES[0];
}

function toFriendlyAuthError(error) {
  const message = error?.message || '';
  const code = error?.code || '';

  if (/rate limit|too many/i.test(message)) {
    return 'Too many codes were requested. Wait a little and try again.';
  }

  if (
    code === 'phone_provider_disabled'
    || /unsupported phone provider|provider.*disabled|phone.*disabled/i.test(message)
  ) {
    return __DEV__
      ? 'Phone verification is not configured in Supabase yet. Enable the Phone provider and connect an SMS provider, or go back and use Development accounts while testing.'
      : 'Phone verification is temporarily unavailable. Please try again later.';
  }

  if (code === 'sms_send_failed') {
    return __DEV__
      ? 'Supabase could not send the text message. Check the configured SMS provider credentials and phone-delivery permissions.'
      : 'The verification text could not be delivered. Check the number and try again.';
  }

  return message || 'The verification code could not be sent.';
}

export function AuthPhoneScreen({ route, navigation }) {
  const inviteToken = route?.params?.inviteToken || null;
  const eventGuestToken = route?.params?.eventGuestToken || null;
  const [country, setCountry] = useState(getInitialCountry);
  const [nationalNumber, setNationalNumber] = useState('');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const callingCode = useMemo(
    () => getCountryCallingCode(country.code),
    [country.code]
  );

  const formattedNumber = useMemo(
    () => new AsYouType(country.code).input(nationalNumber),
    [country.code, nationalNumber]
  );

  const onChangeNumber = (value) => {
    setNationalNumber(value.replace(/[^0-9]/g, '').slice(0, 15));
  };

  const onSendCode = async () => {
    Keyboard.dismiss();

    const parsed = parsePhoneNumberFromString(
      `+${callingCode}${nationalNumber}`
    );

    if (!parsed?.isValid()) {
      Alert.alert(
        'Check your number',
        'Enter a valid mobile number, including the correct country.'
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: parsed.number,
        options: { shouldCreateUser: true },
      });

      if (error) throw error;

      navigation.navigate('AuthOtp', {
        phone: parsed.number,
        displayPhone: parsed.formatInternational(),
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
            <Text style={authStyles.topBarTitle}>Phone verification</Text>
            <View style={authStyles.topBarSide} />
          </View>

          <Text style={authStyles.stepText}>Your account</Text>
          <Text style={authStyles.title}>What’s your phone number?</Text>
          <Text style={authStyles.caption}>
            Circles uses your number for private sign-in and mutual-contact matching. It is never shown on your profile.
          </Text>

          <Text style={authStyles.inputLabel}>Mobile number</Text>
          <View style={[styles.phoneField, focused && authStyles.inputFocused]}>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setCountryPickerOpen(true);
              }}
              style={styles.countryButton}
            >
              <Text style={styles.flag}>{country.flag}</Text>
              <Text style={styles.callingCode}>+{callingCode}</Text>
              <Ionicons name="chevron-down" size={15} color={COLORS.subtext} />
            </Pressable>

            <View style={styles.phoneDivider} />

            <TextInput
              value={formattedNumber}
              onChangeText={onChangeNumber}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Mobile number"
              placeholderTextColor="#9a9a9a"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              autoFocus
              inputAccessoryViewID={Platform.OS === 'ios' ? PHONE_INPUT_ACCESSORY_ID : undefined}
              onSubmitEditing={Keyboard.dismiss}
              style={styles.phoneInput}
            />
          </View>

          <Text style={authStyles.helperText}>
            We’ll send a six-digit code. Message and data rates may apply.
          </Text>

          <Pressable
            onPress={onSendCode}
            disabled={loading || nationalNumber.length < 6}
            style={({ pressed }) => [
              authStyles.primaryButton,
              (loading || nationalNumber.length < 6) && authStyles.primaryButtonDisabled,
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

        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={PHONE_INPUT_ACCESSORY_ID}>
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

      <Modal
        visible={countryPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCountryPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCountryPickerOpen(false)}
        >
          <Pressable style={styles.countrySheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choose a country</Text>
              <Pressable
                onPress={() => setCountryPickerOpen(false)}
                hitSlop={10}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            <FlatList
              data={COUNTRIES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setCountry(item);
                    setCountryPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.countryRow,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <Text style={styles.countryName}>{item.name}</Text>
                  <Text style={styles.countryCode}>
                    +{getCountryCallingCode(item.code)}
                  </Text>
                  {item.code === country.code ? (
                    <Ionicons name="checkmark" size={20} color={COLORS.text} />
                  ) : (
                    <View style={{ width: 20 }} />
                  )}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
  phoneField: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    overflow: 'hidden',
  },
  countryButton: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 10,
  },
  flag: {
    fontSize: 20,
    marginRight: 7,
  },
  callingCode: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    marginRight: 4,
  },
  phoneDivider: {
    width: StyleSheet.hairlineWidth,
    height: 26,
    backgroundColor: COLORS.border,
  },
  phoneInput: {
    flex: 1,
    height: 54,
    paddingHorizontal: 13,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 17,
  },
  pressed: {
    opacity: 0.68,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  countrySheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: COLORS.bg,
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d4d4d4',
    alignSelf: 'center',
    marginTop: 9,
  },
  sheetHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f3f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  rowPressed: {
    backgroundColor: '#f7f7f7',
  },
  countryFlag: {
    width: 36,
    fontSize: 22,
  },
  countryName: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
  },
  countryCode: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    marginRight: 14,
  },
});
