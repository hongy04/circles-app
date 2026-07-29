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
import { Avatar } from '../../components/Avatar';
import {
  APPEAL_DECISIONS,
  APPEAL_RESOLUTION_LABELS,
  fetchModerationAppealDetail,
  resolveModerationAppeal,
} from '../../services/accountAppealService';
import { formatEnforcementEnd } from '../../services/accountEnforcementService';

const DURATION_OPTIONS = [
  { value: '24', label: '24 hours' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
];

function ChoiceRow({ options, value, onChange }) {
  return (
    <View style={styles.choiceWrap}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.choice,
              selected && styles.choiceSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export function ModerationAppealDetailScreen({ navigation, route }) {
  const appealId = route?.params?.appealId;
  const [appeal, setAppeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState('uphold');
  const [duration, setDuration] = useState('168');
  const [publicMessage, setPublicMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchModerationAppealDetail(appealId);
      setAppeal(next);
      setPublicMessage(next.publicResolutionMessage || '');
      setInternalNote(next.internalNote || '');
      if (!next.currentEnforcement.active && next.status !== 'resolved') {
        setDecision('close_inactive');
      } else if (next.currentEnforcement.state !== 'suspended') {
        setDecision('uphold');
      }
    } catch (error) {
      Alert.alert('Appeal unavailable', error?.message || 'Please try again.', [
        { text: 'Back', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [appealId, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const decisionOptions = useMemo(() => {
    if (!appeal) return APPEAL_DECISIONS;
    return APPEAL_DECISIONS.filter((item) => {
      if (item.value === 'change_to_restriction') {
        return appeal.currentEnforcement.active && appeal.currentEnforcement.state === 'suspended';
      }
      if (item.value === 'close_inactive') return !appeal.currentEnforcement.active;
      return appeal.currentEnforcement.active;
    });
  }, [appeal]);

  const resolve = async () => {
    if (!appeal || appeal.status === 'resolved' || saving) return;

    const label = decisionOptions.find((item) => item.value === decision)?.label || 'Resolve appeal';
    Alert.alert(
      `${label}?`,
      'This decision will be written to the immutable moderation audit trail.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm decision',
          style: decision === 'lift' ? 'destructive' : 'default',
          onPress: async () => {
            setSaving(true);
            try {
              await resolveModerationAppeal({
                appealId,
                decision,
                durationHours: decision === 'shorten' ? Number(duration) : null,
                publicMessage,
                internalNote,
              });
              await load();
              Alert.alert('Appeal resolved', 'The account owner can now see the broad review outcome.');
            } catch (error) {
              Alert.alert('Appeal not resolved', error?.message || 'Please try again.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading || !appeal) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <View style={styles.centered}><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }

  const resolved = appeal.status === 'resolved';

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBarSide}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Review appeal</Text>
        <View style={styles.topBarSide} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.identityCard}>
            <Avatar size={52} name={appeal.account.displayName} uri={appeal.account.avatarUrl} />
            <View style={styles.identityCopy}>
              <Text style={styles.identityLabel}>Account owner</Text>
              <Text style={styles.identityName}>{appeal.account.displayName}</Text>
              {appeal.account.username ? <Text style={styles.username}>@{appeal.account.username}</Text> : null}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>APPEAL</Text>
            <Text style={styles.appealText}>{appeal.appealText}</Text>
            <Text style={styles.meta}>Submitted {formatDate(appeal.submittedAt)}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>ACCOUNT ACTION</Text>
            <Text style={styles.actionTitle}>
              {appeal.enforcementState === 'suspended' ? 'Suspension' : 'Restriction'}
            </Text>
            {appeal.currentEnforcement.active ? (
              <>
                <Text style={styles.meta}>Active · Ends {formatEnforcementEnd(appeal.currentEnforcement.endsAt)}</Text>
                {appeal.currentEnforcement.publicMessage ? (
                  <Text style={styles.actionMessage}>{appeal.currentEnforcement.publicMessage}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.inactiveText}>The appealed account action is no longer active.</Text>
            )}
          </View>

          {resolved ? (
            <View style={styles.resolvedCard}>
              <Ionicons name="checkmark-circle-outline" size={28} color="#237a3b" />
              <Text style={styles.resolvedTitle}>
                {APPEAL_RESOLUTION_LABELS[appeal.resolutionCode] || 'Appeal resolved'}
              </Text>
              <Text style={styles.resolvedText}>
                {appeal.publicResolutionMessage || 'The appeal review is complete.'}
              </Text>
              {appeal.internalNote ? (
                <>
                  <Text style={styles.cardLabel}>PRIVATE MODERATOR NOTE</Text>
                  <Text style={styles.internalNoteText}>{appeal.internalNote}</Text>
                </>
              ) : null}
            </View>
          ) : (
            <View style={styles.reviewCard}>
              <Text style={styles.cardLabel}>DECISION</Text>
              <ChoiceRow options={decisionOptions} value={decision} onChange={setDecision} />

              {decision === 'shorten' ? (
                <>
                  <Text style={styles.sectionTitle}>Remaining duration from now</Text>
                  <ChoiceRow options={DURATION_OPTIONS} value={duration} onChange={setDuration} />
                </>
              ) : null}

              <Text style={styles.sectionTitle}>Message visible to account owner</Text>
              <TextInput
                value={publicMessage}
                onChangeText={setPublicMessage}
                multiline
                maxLength={500}
                placeholder="Optional neutral explanation of the appeal outcome…"
                placeholderTextColor="#999"
                textAlignVertical="top"
                style={styles.publicInput}
              />
              <Text style={styles.characterCount}>{publicMessage.length}/500</Text>

              <Text style={styles.sectionTitle}>Private review note</Text>
              <TextInput
                value={internalNote}
                onChangeText={setInternalNote}
                multiline
                maxLength={4000}
                placeholder="Evidence reviewed, rationale, or internal follow-up…"
                placeholderTextColor="#999"
                textAlignVertical="top"
                style={styles.internalInput}
              />
              <Text style={styles.characterCount}>{internalNote.length}/4000</Text>

              <Pressable
                onPress={resolve}
                disabled={saving}
                style={({ pressed }) => [styles.resolveButton, saving && styles.disabled, pressed && styles.pressed]}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.resolveButtonText}>Resolve Appeal</Text>}
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
  identityCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: '#fff', padding: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  identityCopy: { flex: 1, marginLeft: 12 },
  identityLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 1, color: COLORS.subtext },
  identityName: { marginTop: 2, fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text },
  username: { marginTop: 2, fontFamily: 'Manrope_500Medium', fontSize: 11, color: COLORS.subtext },
  card: { borderRadius: 18, backgroundColor: '#fff', padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  cardLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 1, color: COLORS.subtext },
  appealText: { marginTop: 10, fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 21, color: COLORS.text },
  meta: { marginTop: 9, fontFamily: 'Manrope_500Medium', fontSize: 11, color: COLORS.subtext },
  actionTitle: { marginTop: 8, fontFamily: 'Manrope_700Bold', fontSize: 17, color: COLORS.text },
  actionMessage: { marginTop: 9, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: COLORS.text },
  inactiveText: { marginTop: 8, fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#9b2c2c' },
  reviewCard: { borderRadius: 18, backgroundColor: '#fff', padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  choice: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f0f0f0' },
  choiceSelected: { backgroundColor: COLORS.text },
  choiceText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: COLORS.subtext },
  choiceTextSelected: { color: '#fff' },
  sectionTitle: { marginTop: 18, marginBottom: 8, fontFamily: 'Manrope_700Bold', fontSize: 13, color: COLORS.text },
  publicInput: { minHeight: 100, borderWidth: 1, borderColor: '#d7d7d7', borderRadius: 13, padding: 12, fontFamily: 'Manrope_500Medium', fontSize: 13, color: COLORS.text },
  internalInput: { minHeight: 140, borderWidth: 1, borderColor: '#d7d7d7', borderRadius: 13, padding: 12, fontFamily: 'Manrope_500Medium', fontSize: 13, color: COLORS.text },
  characterCount: { marginTop: 5, textAlign: 'right', fontFamily: 'Manrope_500Medium', fontSize: 10, color: COLORS.subtext },
  resolveButton: { minHeight: 48, marginTop: 18, borderRadius: 14, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  resolveButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
  resolvedCard: { alignItems: 'flex-start', borderRadius: 18, backgroundColor: '#eef8f0', padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: '#b8dec0' },
  resolvedTitle: { marginTop: 8, fontFamily: 'Manrope_700Bold', fontSize: 17, color: '#1f6b34' },
  resolvedText: { marginTop: 6, marginBottom: 18, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: '#315b3c' },
  internalNoteText: { marginTop: 7, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: COLORS.text },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.65 },
});
