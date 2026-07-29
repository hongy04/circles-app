import React, { useCallback, useEffect, useState } from 'react';
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
import { Avatar } from '../../components/Avatar';
import {
  AGE_CORRECTION_RESOLUTION_LABELS,
  fetchModerationAgeCorrectionDetail,
  resolveModerationAgeCorrection,
} from '../../services/ageCorrectionService';

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDate(value) {
  const date = parseIsoDate(value);
  if (!date || Number.isNaN(date.getTime())) return value || '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export function ModerationAgeCorrectionDetailScreen({ navigation, route }) {
  const requestId = route?.params?.requestId;
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState('approve');
  const [publicMessage, setPublicMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchModerationAgeCorrectionDetail(requestId);
      setRequest(next);
      setPublicMessage(next.publicResolutionMessage || '');
      setInternalNote(next.internalNote || '');
    } catch (error) {
      Alert.alert('Correction request unavailable', error?.message || 'Please try again.', [
        { text: 'Back', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [navigation, requestId]);

  useEffect(() => {
    load();
  }, [load]);

  const performResolve = async () => {
    setSaving(true);
    try {
      await resolveModerationAgeCorrection({
        requestId,
        decision,
        publicMessage,
        internalNote,
      });
      await load();
      Alert.alert('Correction request resolved', 'The account owner can now see the broad outcome.');
    } catch (error) {
      Alert.alert('Request not resolved', error?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmResolve = () => {
    const approving = decision === 'approve';
    const message = approving
      ? `Approve changing the private birth date from ${formatDate(request.currentDateOfBirth)} to ${formatDate(request.requestedDateOfBirth)}? Eligibility will be recalculated immediately.`
      : 'Deny this correction request and leave the saved birth date unchanged?';

    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(message)) performResolve();
      return;
    }

    Alert.alert(approving ? 'Approve correction?' : 'Deny correction?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: approving ? 'Approve' : 'Deny', style: approving ? 'default' : 'destructive', onPress: performResolve },
    ]);
  };

  if (loading || !request) {
    return <SafeAreaView edges={['top']} style={styles.screen}><View style={styles.centered}><ActivityIndicator /></View></SafeAreaView>;
  }

  const resolved = request.status === 'resolved';

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBarSide}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Review age correction</Text>
        <View style={styles.topBarSide} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <View style={styles.warningCard}>
            <Ionicons name="lock-closed-outline" size={21} color="#674b18" />
            <Text style={styles.warningText}>Birth dates are sensitive. Keep them out of general report notes and external communication.</Text>
          </View>

          <View style={styles.identityCard}>
            <Avatar size={52} name={request.account.displayName} uri={request.account.avatarUrl} />
            <View style={styles.identityCopy}>
              <Text style={styles.identityLabel}>ACCOUNT OWNER</Text>
              <Text style={styles.identityName}>{request.account.displayName}</Text>
              {request.account.username ? <Text style={styles.username}>@{request.account.username}</Text> : null}
            </View>
          </View>

          <View style={styles.dateCard}>
            <View style={styles.dateColumn}>
              <Text style={styles.cardLabel}>CURRENT DATE</Text>
              <Text style={styles.dateValue}>{formatDate(request.currentDateOfBirth)}</Text>
            </View>
            <Ionicons name="arrow-forward" size={22} color={COLORS.subtext} />
            <View style={styles.dateColumn}>
              <Text style={styles.cardLabel}>REQUESTED DATE</Text>
              <Text style={styles.dateValue}>{formatDate(request.requestedDateOfBirth)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>OWNER EXPLANATION</Text>
            <Text style={styles.reasonText}>{request.reason}</Text>
            <Text style={styles.meta}>Submitted {formatTimestamp(request.submittedAt)}</Text>
          </View>

          {resolved ? (
            <View style={styles.resolvedCard}>
              <Ionicons name="checkmark-circle-outline" size={28} color="#237a3b" />
              <Text style={styles.resolvedTitle}>{AGE_CORRECTION_RESOLUTION_LABELS[request.resolutionCode] || 'Review complete'}</Text>
              <Text style={styles.resolvedText}>{request.publicResolutionMessage || 'The private correction review is complete.'}</Text>
              {request.internalNote ? (
                <>
                  <Text style={styles.cardLabel}>PRIVATE ADMIN NOTE</Text>
                  <Text style={styles.internalNoteText}>{request.internalNote}</Text>
                </>
              ) : null}
            </View>
          ) : (
            <View style={styles.reviewCard}>
              <Text style={styles.cardLabel}>DECISION</Text>
              <View style={styles.decisionRow}>
                {[
                  { value: 'approve', label: 'Approve correction' },
                  { value: 'deny', label: 'Deny correction' },
                ].map((option) => {
                  const selected = decision === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setDecision(option.value)}
                      style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}
                    >
                      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionTitle}>Message visible to account owner</Text>
              <TextInput
                value={publicMessage}
                onChangeText={setPublicMessage}
                multiline
                maxLength={500}
                placeholder="Optional neutral explanation of the outcome…"
                placeholderTextColor="#999"
                textAlignVertical="top"
                style={styles.publicInput}
              />
              <Text style={styles.characterCount}>{publicMessage.length}/500</Text>

              <Text style={styles.sectionTitle}>Private admin note</Text>
              <TextInput
                value={internalNote}
                onChangeText={setInternalNote}
                multiline
                maxLength={4000}
                placeholder="Verification steps, rationale, or follow-up…"
                placeholderTextColor="#999"
                textAlignVertical="top"
                style={styles.internalInput}
              />
              <Text style={styles.characterCount}>{internalNote.length}/4000</Text>

              <View style={styles.effectNote}>
                <Ionicons name="information-circle-outline" size={18} color={COLORS.subtext} />
                <Text style={styles.effectNoteText}>
                  Approval recalculates age eligibility immediately. An under-18 result closes romantic state and locks preserved Our Circle history. Adult eligibility never turns romance on automatically.
                </Text>
              </View>

              <Pressable
                onPress={confirmResolve}
                disabled={saving}
                style={({ pressed }) => [styles.resolveButton, decision === 'deny' && styles.denyButton, saving && styles.disabled, pressed && styles.pressed]}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.resolveButtonText}>{decision === 'approve' ? 'Approve Correction' : 'Deny Correction'}</Text>}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, backgroundColor: COLORS.bg },
  topBarSide: { width: 52 },
  topBarTitle: { flex: 1, textAlign: 'center', fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 16, paddingBottom: 50, gap: 12 },
  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: 14, backgroundColor: '#fff6df', borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5cf9d' },
  warningText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 11, lineHeight: 16, color: '#674b18' },
  identityCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: '#fff', padding: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  identityCopy: { flex: 1, marginLeft: 12 },
  identityLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 1, color: COLORS.subtext },
  identityName: { marginTop: 2, fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text },
  username: { marginTop: 2, fontFamily: 'Manrope_500Medium', fontSize: 11, color: COLORS.subtext },
  dateCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, backgroundColor: '#fff', padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  dateColumn: { flex: 1 },
  card: { borderRadius: 18, backgroundColor: '#fff', padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  cardLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 1, color: COLORS.subtext },
  dateValue: { marginTop: 6, fontFamily: 'Manrope_700Bold', fontSize: 15, color: COLORS.text },
  reasonText: { marginTop: 10, fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 21, color: COLORS.text },
  meta: { marginTop: 9, fontFamily: 'Manrope_500Medium', fontSize: 11, color: COLORS.subtext },
  reviewCard: { borderRadius: 18, backgroundColor: '#fff', padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  decisionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  choice: { flex: 1, alignItems: 'center', paddingHorizontal: 11, paddingVertical: 10, borderRadius: 999, backgroundColor: '#f0f0f0' },
  choiceSelected: { backgroundColor: COLORS.text },
  choiceText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: COLORS.subtext },
  choiceTextSelected: { color: '#fff' },
  sectionTitle: { marginTop: 18, marginBottom: 8, fontFamily: 'Manrope_700Bold', fontSize: 13, color: COLORS.text },
  publicInput: { minHeight: 100, borderWidth: 1, borderColor: '#d7d7d7', borderRadius: 13, padding: 12, fontFamily: 'Manrope_500Medium', fontSize: 13, color: COLORS.text },
  internalInput: { minHeight: 140, borderWidth: 1, borderColor: '#d7d7d7', borderRadius: 13, padding: 12, fontFamily: 'Manrope_500Medium', fontSize: 13, color: COLORS.text },
  characterCount: { marginTop: 5, textAlign: 'right', fontFamily: 'Manrope_500Medium', fontSize: 10, color: COLORS.subtext },
  effectNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 15, padding: 12, borderRadius: 12, backgroundColor: '#f3f3f3' },
  effectNoteText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 16, color: COLORS.subtext },
  resolveButton: { minHeight: 48, marginTop: 18, borderRadius: 14, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  denyButton: { backgroundColor: '#9b2c2c' },
  resolveButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
  resolvedCard: { alignItems: 'flex-start', borderRadius: 18, backgroundColor: '#eef8f0', padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: '#b8dec0' },
  resolvedTitle: { marginTop: 8, fontFamily: 'Manrope_700Bold', fontSize: 17, color: '#1f6b34' },
  resolvedText: { marginTop: 6, marginBottom: 18, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: '#315b3c' },
  internalNoteText: { marginTop: 7, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: COLORS.text },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.65 },
});
