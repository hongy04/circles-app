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
  AGE_CORRECTION_RESOLUTION_LABELS,
  AGE_CORRECTION_STATUS_LABELS,
  fetchMyAgeCorrectionRequest,
  submitMyAgeCorrectionRequest,
} from '../../services/ageCorrectionService';

function formatBirthDateInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return { iso: `${match[1]}-${match[2]}-${match[3]}`, date };
}

function formatDate(value) {
  const parsed = parseIsoDate(value);
  if (!parsed) return value || '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed.date);
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export function AgeCorrectionRequestScreen() {
  const [request, setRequest] = useState(null);
  const [requestedDate, setRequestedDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRequest(await fetchMyAgeCorrectionRequest());
    } catch (loadError) {
      setError(loadError?.message || 'Could not load your correction request.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const parsedDate = useMemo(() => parseIsoDate(requestedDate), [requestedDate]);
  const canSubmitForm = Boolean(
    request?.canSubmit
    && parsedDate
    && parsedDate.iso !== request.currentDateOfBirth
    && reason.trim().length >= 20
    && !saving
  );

  const performSubmit = async () => {
    if (!canSubmitForm) return;
    setSaving(true);
    try {
      await submitMyAgeCorrectionRequest({
        requestedDateOfBirth: parsedDate.iso,
        reason,
      });
      setRequestedDate('');
      setReason('');
      await load();
      Alert.alert('Request submitted', 'Your saved birth date stays unchanged while an administrator reviews the request.');
    } catch (submitError) {
      Alert.alert('Request not submitted', submitError?.message || 'Please review the request and try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmSubmit = () => {
    if (!parsedDate) {
      Alert.alert('Use YYYY-MM-DD', 'Enter a complete, valid requested birth date.');
      return;
    }
    if (reason.trim().length < 20) {
      Alert.alert('Add more detail', 'Explain the correction in at least 20 characters.');
      return;
    }

    const message = `Request changing your private birth date from ${formatDate(request.currentDateOfBirth)} to ${formatDate(parsedDate.iso)}? The current date remains active until the request is approved.`;
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(message)) performSubmit();
      return;
    }
    Alert.alert('Submit private correction?', message, [
      { text: 'Review', style: 'cancel' },
      { text: 'Submit', onPress: performSubmit },
    ]);
  };

  if (loading && !request) {
    return <View style={styles.centered}><ActivityIndicator /><Text style={styles.loadingText}>Loading correction request…</Text></View>;
  }

  if (error && !request) {
    return (
      <View style={styles.centered}>
        <Ionicons name="shield-outline" size={38} color={COLORS.subtext} />
        <Text style={styles.errorTitle}>Correction request unavailable</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Pressable onPress={load} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>
      </View>
    );
  }

  const activeRequest = request?.status === 'submitted' || request?.status === 'reviewing';

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.introCard}>
            <Ionicons name="lock-closed-outline" size={25} color={COLORS.text} />
            <View style={styles.introCopy}>
              <Text style={styles.introTitle}>Private correction process</Text>
              <Text style={styles.introBody}>
                Your current and requested birth dates are visible only to you and admin-level safety staff. They are not shown on profiles or added to analytics.
              </Text>
            </View>
          </View>

          {!request?.birthDateSet ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Save a birth date first</Text>
              <Text style={styles.noticeBody}>A correction request is available only after a birth date has been confirmed.</Text>
            </View>
          ) : (
            <View style={styles.currentCard}>
              <Text style={styles.label}>CURRENT SAVED DATE</Text>
              <Text style={styles.currentDate}>{formatDate(request.currentDateOfBirth)}</Text>
            </View>
          )}

          {request?.hasRequest ? (
            <View style={[styles.statusCard, activeRequest && styles.activeStatusCard]}>
              <View style={styles.statusHeader}>
                <Ionicons
                  name={request.status === 'resolved' ? 'checkmark-circle-outline' : 'time-outline'}
                  size={25}
                  color={request.status === 'resolved' ? '#237a42' : '#8a5b00'}
                />
                <View style={styles.statusCopy}>
                  <Text style={styles.statusTitle}>
                    {request.status === 'resolved'
                      ? AGE_CORRECTION_RESOLUTION_LABELS[request.resolutionCode] || 'Review complete'
                      : AGE_CORRECTION_STATUS_LABELS[request.status] || request.status}
                  </Text>
                  <Text style={styles.statusMeta}>Requested {formatDate(request.requestedDateOfBirth)}</Text>
                </View>
              </View>
              <Text style={styles.reasonText}>{request.reason}</Text>
              <Text style={styles.timestamp}>Submitted {formatTimestamp(request.submittedAt)}</Text>
              {request.publicResolutionMessage ? (
                <View style={styles.outcomeBox}>
                  <Text style={styles.outcomeLabel}>REVIEW OUTCOME</Text>
                  <Text style={styles.outcomeText}>{request.publicResolutionMessage}</Text>
                </View>
              ) : null}
              {activeRequest ? (
                <Text style={styles.activeNote}>Your saved birth date and eligibility remain unchanged while this request is reviewed.</Text>
              ) : null}
            </View>
          ) : null}

          {request?.canSubmit ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{request.hasRequest ? 'Request another correction' : 'Request a correction'}</Text>
              <Text style={styles.label}>REQUESTED DATE OF BIRTH</Text>
              <TextInput
                value={requestedDate}
                onChangeText={(value) => setRequestedDate(formatBirthDateInput(value))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
                style={styles.dateInput}
              />

              <Text style={styles.label}>WHY THIS NEEDS TO BE CORRECTED</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                maxLength={2000}
                placeholder="Explain what was entered incorrectly and why the requested date is accurate…"
                placeholderTextColor="#999"
                textAlignVertical="top"
                style={styles.reasonInput}
              />
              <Text style={styles.characterCount}>{reason.length}/2000</Text>

              <Pressable
                onPress={confirmSubmit}
                disabled={!canSubmitForm}
                style={({ pressed }) => [styles.submitButton, !canSubmitForm && styles.disabled, pressed && styles.pressed]}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Submit private request</Text>}
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.footerText}>
            Approval may change romantic eligibility. It never automatically turns romantic features on or restores prior romantic state.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 16, paddingBottom: 48, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: '#f7f7f7' },
  loadingText: { marginTop: 10, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12 },
  errorTitle: { marginTop: 12, color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 17 },
  errorBody: { marginTop: 7, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  retryButton: { marginTop: 16, borderRadius: 11, backgroundColor: COLORS.text, paddingHorizontal: 17, paddingVertical: 11 },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 12 },
  introCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderRadius: 17, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  introCopy: { flex: 1, marginLeft: 12 },
  introTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text },
  introBody: { marginTop: 5, fontFamily: 'Manrope_400Regular', fontSize: 12, lineHeight: 18, color: COLORS.subtext },
  noticeCard: { padding: 16, borderRadius: 16, backgroundColor: '#fff7e6', borderWidth: StyleSheet.hairlineWidth, borderColor: '#ead19a' },
  noticeTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#7a4a00' },
  noticeBody: { marginTop: 5, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, color: '#765b2c' },
  currentCard: { padding: 16, borderRadius: 16, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  label: { marginTop: 14, fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 0.8, color: COLORS.subtext },
  currentDate: { marginTop: 5, fontFamily: 'Manrope_700Bold', fontSize: 18, color: COLORS.text },
  statusCard: { padding: 16, borderRadius: 17, backgroundColor: '#eef8f0', borderWidth: StyleSheet.hairlineWidth, borderColor: '#b8dec0' },
  activeStatusCard: { backgroundColor: '#fff8e9', borderColor: '#e6cb8f' },
  statusHeader: { flexDirection: 'row', alignItems: 'center' },
  statusCopy: { flex: 1, marginLeft: 10 },
  statusTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: COLORS.text },
  statusMeta: { marginTop: 2, fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: COLORS.subtext },
  reasonText: { marginTop: 13, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: COLORS.text },
  timestamp: { marginTop: 8, fontFamily: 'Manrope_500Medium', fontSize: 10, color: COLORS.subtext },
  outcomeBox: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.72)' },
  outcomeLabel: { fontFamily: 'Manrope_700Bold', fontSize: 9.5, letterSpacing: 0.8, color: COLORS.subtext },
  outcomeText: { marginTop: 6, fontFamily: 'Manrope_500Medium', fontSize: 12.5, lineHeight: 18, color: COLORS.text },
  activeNote: { marginTop: 13, fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, lineHeight: 17, color: '#765b2c' },
  formCard: { padding: 16, borderRadius: 17, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  formTitle: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: COLORS.text },
  dateInput: { height: 50, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#d7d7d7', paddingHorizontal: 13, fontFamily: 'Manrope_600SemiBold', fontSize: 16, color: COLORS.text },
  reasonInput: { minHeight: 130, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#d7d7d7', padding: 12, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: COLORS.text },
  characterCount: { marginTop: 5, textAlign: 'right', fontFamily: 'Manrope_500Medium', fontSize: 10, color: COLORS.subtext },
  submitButton: { minHeight: 49, marginTop: 16, borderRadius: 14, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  submitButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.68 },
  footerText: { paddingHorizontal: 14, marginTop: 3, textAlign: 'center', fontFamily: 'Manrope_400Regular', fontSize: 11, lineHeight: 17, color: COLORS.subtext },
});
