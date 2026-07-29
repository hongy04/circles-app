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
import {
  APPEAL_RESOLUTION_LABELS,
  APPEAL_STATUS_LABELS,
  getMyAccountEnforcementAppeal,
  submitMyAccountEnforcementAppeal,
} from '../../services/accountAppealService';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function AppealReceipt({ appeal }) {
  const resolved = appeal.status === 'resolved';
  return (
    <View style={styles.receiptCard}>
      <View style={styles.receiptHeader}>
        <View style={[styles.statusIcon, resolved && styles.resolvedIcon]}>
          <Ionicons
            name={resolved ? 'checkmark-circle-outline' : 'time-outline'}
            size={23}
            color={resolved ? '#237a3b' : '#8a4b08'}
          />
        </View>
        <View style={styles.receiptHeaderCopy}>
          <Text style={styles.receiptTitle}>
            {APPEAL_STATUS_LABELS[appeal.status] || 'Appeal submitted'}
          </Text>
          {appeal.submittedAt ? (
            <Text style={styles.receiptMeta}>Submitted {formatDate(appeal.submittedAt)}</Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.sectionLabel}>YOUR APPEAL</Text>
      <Text style={styles.appealText}>{appeal.appealText}</Text>

      {resolved ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>
            {APPEAL_RESOLUTION_LABELS[appeal.resolutionCode] || 'Review completed'}
          </Text>
          <Text style={styles.resultText}>
            {appeal.publicResolutionMessage || 'Circles completed the appeal review.'}
          </Text>
        </View>
      ) : (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingText}>
            The current account action remains in effect while the appeal is reviewed. Submitting an appeal does not contact the reporting user or make your explanation public.
          </Text>
        </View>
      )}
    </View>
  );
}

export function AccountAppealScreen({ navigation }) {
  const [appeal, setAppeal] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getMyAccountEnforcementAppeal();
      setAppeal(next);
    } catch (error) {
      Alert.alert('Appeal unavailable', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const clean = text.trim();
    if (clean.length < 20) {
      Alert.alert('Add more context', 'Explain the reason for your appeal in at least 20 characters.');
      return;
    }

    Alert.alert(
      'Submit this appeal?',
      'You can submit one appeal for this account action. The action remains active while Circles reviews it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit appeal',
          onPress: async () => {
            setSubmitting(true);
            try {
              await submitMyAccountEnforcementAppeal(clean);
              setText('');
              await load();
            } catch (error) {
              Alert.alert('Appeal not submitted', error?.message || 'Please try again.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBarSide}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Account appeal</Text>
        <View style={styles.topBarSide} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator /></View>
      ) : (
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
            {appeal?.hasAppeal ? <AppealReceipt appeal={appeal} /> : null}

            {!appeal?.hasAppeal && appeal?.canSubmit ? (
              <View style={styles.formCard}>
                <View style={styles.formIcon}>
                  <Ionicons name="chatbox-ellipses-outline" size={26} color={COLORS.text} />
                </View>
                <Text style={styles.formTitle}>Explain what should be reconsidered</Text>
                <Text style={styles.formBody}>
                  Include relevant context and why you believe the restriction or suspension should be changed. Do not include private information about another person unless it is necessary for the review.
                </Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  multiline
                  maxLength={4000}
                  placeholder="Describe the mistake, missing context, or change you are requesting…"
                  placeholderTextColor="#999"
                  textAlignVertical="top"
                  style={styles.input}
                />
                <Text style={styles.characterCount}>{text.length}/4000</Text>
                <Pressable
                  onPress={submit}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    submitting && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.primaryButtonText}>Submit Appeal</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {!appeal?.hasAppeal && !appeal?.hasActiveEnforcement ? (
              <View style={styles.clearCard}>
                <Ionicons name="shield-checkmark-outline" size={34} color="#237a3b" />
                <Text style={styles.formTitle}>No active action to appeal</Text>
                <Text style={styles.formBody}>
                  Your account does not currently have a restriction or suspension.
                </Text>
              </View>
            ) : null}

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>What an appeal does</Text>
              <Text style={styles.infoText}>
                An appeal asks a separate moderator to review the current account action. It does not reveal the reporting user, reopen romantic or relationship state, or temporarily remove the action while review is pending.
              </Text>
            </View>

            <Pressable
              onPress={load}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="refresh-outline" size={19} color={COLORS.text} />
              <Text style={styles.secondaryButtonText}>Refresh appeal status</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, backgroundColor: COLORS.bg },
  topBarSide: { width: 52, height: 42, justifyContent: 'center' },
  topBarTitle: { flex: 1, textAlign: 'center', fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 18, paddingBottom: 48, gap: 14 },
  receiptCard: { borderRadius: 20, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, padding: 18 },
  receiptHeader: { flexDirection: 'row', alignItems: 'center' },
  statusIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff3df' },
  resolvedIcon: { backgroundColor: '#eaf7ed' },
  receiptHeaderCopy: { flex: 1, marginLeft: 11 },
  receiptTitle: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: COLORS.text },
  receiptMeta: { marginTop: 3, fontFamily: 'Manrope_500Medium', fontSize: 11, color: COLORS.subtext },
  sectionLabel: { marginTop: 18, marginBottom: 7, fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 1, color: COLORS.subtext },
  appealText: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 21, color: COLORS.text },
  resultBox: { marginTop: 16, borderRadius: 14, backgroundColor: '#eef8f0', padding: 14 },
  resultTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#1f6b34' },
  resultText: { marginTop: 5, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: '#315b3c' },
  pendingBox: { marginTop: 16, borderRadius: 14, backgroundColor: '#fff8eb', padding: 14 },
  pendingText: { fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: '#6f4b1f' },
  formCard: { borderRadius: 20, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, padding: 18 },
  formIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' },
  formTitle: { marginTop: 12, fontFamily: 'Manrope_700Bold', fontSize: 18, color: COLORS.text },
  formBody: { marginTop: 7, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20, color: COLORS.subtext },
  input: { minHeight: 180, marginTop: 16, borderWidth: 1, borderColor: '#d7d7d7', borderRadius: 14, padding: 13, fontFamily: 'Manrope_500Medium', fontSize: 14, color: COLORS.text, backgroundColor: '#fff' },
  characterCount: { marginTop: 6, textAlign: 'right', fontFamily: 'Manrope_500Medium', fontSize: 10, color: COLORS.subtext },
  primaryButton: { minHeight: 48, marginTop: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.text },
  primaryButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
  clearCard: { borderRadius: 20, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, padding: 20, alignItems: 'center' },
  infoCard: { borderRadius: 16, backgroundColor: '#efefef', padding: 15 },
  infoTitle: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: COLORS.text },
  infoText: { marginTop: 5, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, color: COLORS.subtext },
  secondaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: COLORS.text },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.65 },
});
