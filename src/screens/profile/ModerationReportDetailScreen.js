import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { REPORT_REASONS } from '../../services/safetyService';
import {
  fetchModerationReport,
  getModerationAccess,
  REPORT_RESOLUTIONS,
  REPORT_SEVERITIES,
  REPORT_STATUS_LABELS,
  updateModerationReport,
} from '../../services/safetyModerationService';

const STATUSES = ['submitted', 'reviewing', 'resolved', 'dismissed'];

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function ChoiceRow({ options, value, onChange }) {
  return (
    <View style={styles.choiceWrap}>
      {options.map((option) => {
        const normalized = typeof option === 'string'
          ? { value: option, label: REPORT_STATUS_LABELS[option] || option }
          : option;
        const selected = normalized.value === value;
        return (
          <Pressable
            key={normalized.value}
            onPress={() => onChange(normalized.value)}
            style={({ pressed }) => [
              styles.choice,
              selected && styles.choiceSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
              {normalized.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ModerationReportDetailScreen({ navigation, route }) {
  const reportId = route?.params?.reportId;
  const scrollRef = useRef(null);
  const [report, setReport] = useState(null);
  const [role, setRole] = useState(null);
  const [status, setStatus] = useState('submitted');
  const [severity, setSeverity] = useState(null);
  const [resolutionCode, setResolutionCode] = useState(null);
  const [publicMessage, setPublicMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reasonLabel = useMemo(
    () => REPORT_REASONS.find((item) => item.value === report?.reason)?.label || report?.reason,
    [report?.reason]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, access] = await Promise.all([
        fetchModerationReport(reportId),
        getModerationAccess(),
      ]);
      setReport(detail);
      setRole(access.role);
      setStatus(detail.status || 'submitted');
      setSeverity(detail.severity || null);
      setResolutionCode(detail.resolutionCode || null);
      setPublicMessage(detail.publicResolutionMessage || '');
      setInternalNote(detail.internalNote || '');
    } catch (error) {
      Alert.alert('Report unavailable', error?.message || 'Please try again.', [
        { text: 'Back', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [navigation, reportId]);

  useEffect(() => {
    load();
  }, [load]);

  const availableResolutions = REPORT_RESOLUTIONS.filter(
    (item) => !item.seniorOnly || role === 'senior' || role === 'admin'
  );
  const isClosing = status === 'resolved' || status === 'dismissed';

  const save = async () => {
    if (saving) return;
    if (!severity) {
      Alert.alert('Choose severity', 'Set a severity before saving the review.');
      return;
    }
    if (isClosing && !resolutionCode) {
      Alert.alert('Choose a resolution', 'Closed reports require a resolution.');
      return;
    }

    setSaving(true);
    try {
      await updateModerationReport({
        reportId,
        status,
        severity,
        resolutionCode: isClosing ? resolutionCode : null,
        publicResolutionMessage: isClosing ? publicMessage : '',
        internalNote,
      });
      Alert.alert('Review saved', 'The moderation record and audit log were updated.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Review not saved', error?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !report) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.stateText}>Loading report…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBarSide}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Review report</Text>
        <View style={styles.topBarSide} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.identityCard}>
            <Avatar
              size={54}
              name={report.reportedAccount.displayName}
              uri={report.reportedAccount.avatarUrl}
            />
            <View style={styles.identityCopy}>
              <Text style={styles.identityLabel}>Reported account</Text>
              <Text style={styles.identityName}>{report.reportedAccount.displayName}</Text>
              {report.reportedAccount.username ? (
                <Text style={styles.username}>@{report.reportedAccount.username}</Text>
              ) : null}
              <Text style={styles.reportCount}>
                {report.openReportsAgainstTarget} open report{report.openReportsAgainstTarget === 1 ? '' : 's'} against this account
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>REPORT</Text>
            <Text style={styles.reportReason}>{reasonLabel}</Text>
            <Text style={styles.meta}>
              {formatDate(report.createdAt)} · {report.sourceContext}
            </Text>
            <Text style={styles.reportDetails}>
              {report.details || 'No additional details were provided.'}
            </Text>
            <View style={styles.reporterLine}>
              <Text style={styles.reporterLabel}>Reporter</Text>
              <Text style={styles.reporterValue}>
                {report.reporter.displayName}
                {report.reporter.username ? ` (@${report.reporter.username})` : ''}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Status</Text>
          <ChoiceRow options={STATUSES} value={status} onChange={setStatus} />

          <Text style={styles.sectionTitle}>Severity</Text>
          <ChoiceRow options={REPORT_SEVERITIES} value={severity} onChange={setSeverity} />

          {isClosing ? (
            <>
              <Text style={styles.sectionTitle}>Resolution</Text>
              <ChoiceRow
                options={availableResolutions}
                value={resolutionCode}
                onChange={setResolutionCode}
              />

              <Text style={styles.sectionTitle}>Message visible to reporter</Text>
              <Text style={styles.helperText}>
                Optional. Do not reveal internal evidence, identities, or enforcement details that could create another safety risk.
              </Text>
              <TextInput
                value={publicMessage}
                onChangeText={setPublicMessage}
                multiline
                maxLength={500}
                placeholder="Broad outcome or acknowledgement…"
                placeholderTextColor="#999"
                textAlignVertical="top"
                style={styles.publicInput}
              />
              <Text style={styles.characterCount}>{publicMessage.length}/500</Text>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Private moderator note</Text>
          <Text style={styles.helperText}>
            Internal only. Every saved change is recorded in the moderation audit log.
          </Text>
          <TextInput
            value={internalNote}
            onChangeText={setInternalNote}
            multiline
            maxLength={4000}
            placeholder="Evidence reviewed, rationale, escalation context…"
            placeholderTextColor="#999"
            textAlignVertical="top"
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 180)}
            style={styles.internalInput}
          />
          <Text style={styles.characterCount}>{internalNote.length}/4000</Text>

          <Pressable
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [styles.saveButton, saving && styles.disabled, pressed && styles.pressed]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save review</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateText: { fontFamily: 'Manrope_500Medium', color: COLORS.subtext },
  topBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, backgroundColor: COLORS.bg },
  topBarSide: { width: 52 },
  topBarTitle: { flex: 1, textAlign: 'center', fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text },
  content: { padding: 16, paddingBottom: 52 },
  identityCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  identityCopy: { flex: 1, marginLeft: 12 },
  identityLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, color: COLORS.subtext, letterSpacing: 0.7 },
  identityName: { marginTop: 2, fontFamily: 'Manrope_700Bold', fontSize: 17, color: COLORS.text },
  username: { marginTop: 1, fontFamily: 'Manrope_500Medium', fontSize: 12, color: COLORS.subtext },
  reportCount: { marginTop: 6, fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: '#9b2c2c' },
  card: { marginTop: 12, padding: 15, borderRadius: 16, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  cardLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 0.8, color: COLORS.subtext },
  reportReason: { marginTop: 5, fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text },
  meta: { marginTop: 3, fontFamily: 'Manrope_500Medium', fontSize: 11, color: COLORS.subtext },
  reportDetails: { marginTop: 13, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20, color: COLORS.text },
  reporterLine: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  reporterLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, color: COLORS.subtext },
  reporterValue: { marginTop: 3, fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: COLORS.text },
  sectionTitle: { marginTop: 22, marginBottom: 8, fontFamily: 'Manrope_700Bold', fontSize: 15, color: COLORS.text },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  choiceSelected: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  choiceText: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: COLORS.text },
  choiceTextSelected: { color: '#fff' },
  helperText: { marginBottom: 8, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, color: COLORS.subtext },
  publicInput: { minHeight: 92, padding: 13, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: COLORS.text },
  internalInput: { minHeight: 132, padding: 13, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: COLORS.text },
  characterCount: { marginTop: 5, textAlign: 'right', fontFamily: 'Manrope_500Medium', fontSize: 10, color: COLORS.subtext },
  saveButton: { marginTop: 24, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: COLORS.text },
  saveText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.67 },
});
