import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { COLORS } from '../../theme/colors';
import {
  fetchMyAgeEligibility,
  saveMyDateOfBirth,
} from '../../services/ageEligibilityService';

function formatBirthDateInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    iso: `${match[1]}-${match[2]}-${match[3]}`,
    date,
  };
}

function formatDate(value) {
  if (!value) return '';
  const parsed = parseIsoDate(value);
  if (!parsed) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed.date);
}

export function AgeEligibilityScreen({ navigation }) {
  const [eligibility, setEligibility] = useState(null);
  const [birthDate, setBirthDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEligibility(await fetchMyAgeEligibility());
    } catch (loadError) {
      setError(loadError?.message || 'Could not load age eligibility.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const parsedBirthDate = useMemo(() => parseIsoDate(birthDate), [birthDate]);

  const performSave = async () => {
    if (!parsedBirthDate || saving) return;

    setSaving(true);
    try {
      const next = await saveMyDateOfBirth(parsedBirthDate.iso);
      setEligibility(next);
      setBirthDate('');
    } catch (saveError) {
      Alert.alert(
        'Birth date not saved',
        saveError?.message || 'Please review the date and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmSave = () => {
    if (!parsedBirthDate) {
      Alert.alert('Use YYYY-MM-DD', 'Enter a complete, valid birth date.');
      return;
    }

    const formatted = formatDate(parsedBirthDate.iso);
    const message = `Save ${formatted} as your birth date? Review it carefully. After saving, it cannot be changed in the app.`;

    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(message)) performSave();
      return;
    }

    Alert.alert('Confirm birth date', message, [
      { text: 'Review', style: 'cancel' },
      { text: 'Save', onPress: performSave },
    ]);
  };

  if (loading && !eligibility) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading age eligibility…</Text>
      </View>
    );
  }

  if (error && !eligibility) {
    return (
      <View style={styles.centered}>
        <Ionicons name="shield-outline" size={38} color={COLORS.subtext} />
        <Text style={styles.errorTitle}>Age eligibility unavailable</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Pressable onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const hasSavedDate = Boolean(eligibility?.dateOfBirthSet);

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.content}
        >
          <View style={styles.introCard}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed-outline" size={23} color={COLORS.text} />
            </View>
            <View style={styles.introCopy}>
              <Text style={styles.introTitle}>Private age eligibility</Text>
              <Text style={styles.introBody}>
                Your birth date is used only to determine access to adult romantic features. It is never shown on your profile, to connections, or in analytics.
              </Text>
            </View>
          </View>

          {hasSavedDate ? (
            <View style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <Ionicons
                  name={eligibility.eligibleForRomance ? 'checkmark-circle' : 'time-outline'}
                  size={25}
                  color={eligibility.eligibleForRomance ? '#237a42' : '#8a5b00'}
                />
                <View style={styles.statusCopy}>
                  <Text style={styles.statusTitle}>Birth date saved</Text>
                  <Text style={styles.savedDate}>
                    {formatDate(eligibility.dateOfBirth)}
                  </Text>
                </View>
              </View>

              <Text style={styles.statusBody}>
                {eligibility.eligibleForRomance
                  ? 'You are eligible to turn on adult romantic features. They still remain off until you enable them separately.'
                  : `Romantic features remain unavailable until ${formatDate(eligibility.eligibleOn)}.`}
              </Text>

              <View style={styles.lockedNote}>
                <Ionicons name="information-circle-outline" size={18} color={COLORS.subtext} />
                <Text style={styles.lockedNoteText}>
                  Birth dates cannot be edited directly after confirmation. A private correction request is available for mistakes.
                </Text>
              </View>

              <Pressable
                onPress={() => navigation.navigate('AgeCorrectionRequest')}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Ionicons name="create-outline" size={18} color={COLORS.text} />
                <Text style={styles.secondaryButtonText}>Request a correction</Text>
              </Pressable>

              {eligibility.eligibleForRomance ? (
                <Pressable
                  onPress={() => navigation.navigate('RomanticSettings')}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryButtonText}>Open romantic settings</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
              <TextInput
                value={birthDate}
                onChangeText={(value) => setBirthDate(formatBirthDateInput(value))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9c9c9c"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
                style={styles.input}
                accessibilityLabel="Date of birth"
              />
              <Text style={styles.helperText}>
                Review the date carefully before saving. It will remain private and cannot be changed from the app afterward.
              </Text>

              <Pressable
                disabled={!parsedBirthDate || saving}
                onPress={confirmSave}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!parsedBirthDate || saving) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save birth date</Text>
                )}
              </Pressable>
            </View>
          )}

          <Text style={styles.footerText}>
            This is an in-product eligibility control, not identity verification. Additional age-assurance procedures may still be required before a public release.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  content: { padding: 16, paddingBottom: 44 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#f7f7f7',
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  errorTitle: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  errorBody: {
    marginTop: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    borderRadius: 11,
    backgroundColor: COLORS.text,
    paddingHorizontal: 17,
    paddingVertical: 11,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 12 },
  introCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introCopy: { flex: 1, marginLeft: 13 },
  introTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 16 },
  introBody: {
    marginTop: 5,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  statusCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  statusHeader: { flexDirection: 'row', alignItems: 'center' },
  statusCopy: { marginLeft: 11 },
  statusTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 15 },
  savedDate: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  statusBody: {
    marginTop: 14,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12.5,
    lineHeight: 19,
  },
  lockedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
  },
  lockedNoteText: {
    flex: 1,
    marginLeft: 8,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 17,
  },
  formCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  fieldLabel: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.65,
  },
  input: {
    marginTop: 8,
    height: 50,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#fafafa',
    paddingHorizontal: 14,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  helperText: {
    marginTop: 9,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 17,
  },
  secondaryButton: {
    minHeight: 46,
    marginTop: 14,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f7f7f7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  secondaryButtonText: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
  primaryButton: {
    minHeight: 48,
    marginTop: 18,
    borderRadius: 13,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72 },
  footerText: {
    marginTop: 18,
    paddingHorizontal: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10.5,
    lineHeight: 16,
    textAlign: 'center',
  },
});
