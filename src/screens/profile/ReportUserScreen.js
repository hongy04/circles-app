import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import {
  blockUser,
  REPORT_REASONS,
  submitUserReport,
  submitWhisperSafetyReport,
} from '../../services/safetyService';

export function ReportUserScreen({ navigation, route }) {
  const userId = route?.params?.userId;
  const displayName = route?.params?.displayName || 'this account';
  const sourceContext = route?.params?.sourceContext || 'profile';
  const reportMode = route?.params?.reportMode || 'account';
  const whisperId = route?.params?.whisperId || null;
  const isWhisperReport = reportMode === 'whisper' && Boolean(whisperId);
  const scrollRef = useRef(null);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedReason = useMemo(
    () => REPORT_REASONS.find((item) => item.value === reason),
    [reason]
  );

  const submit = async () => {
    if (!userId || submitting) return;
    if (!reason) {
      Alert.alert('Choose a reason', 'Select the option that best describes what happened.');
      return;
    }

    setSubmitting(true);
    let blockFailed = false;
    try {
      if (isWhisperReport) {
        await submitWhisperSafetyReport({
          whisperId,
          reason,
          details,
        });
      } else {
        await submitUserReport({
          userId,
          reason,
          details,
          sourceContext,
        });
      }

      if (alsoBlock) {
        try {
          await blockUser(userId, sourceContext);
        } catch {
          blockFailed = true;
        }
      }

      Alert.alert(
        'Report submitted',
        blockFailed
          ? 'Your report was saved, but Circles could not block this account. You can try blocking again from their profile.'
          : alsoBlock
            ? 'Your report was saved and the account was blocked. They were not notified.'
            : 'Your report was saved privately. The reported account was not notified.',
        [{
          text: 'Done',
          onPress: () => {
            if (!isWhisperReport && alsoBlock && !blockFailed) {
              navigation.pop(2);
            } else {
              navigation.goBack();
            }
          },
        }]
      );
    } catch (reportError) {
      Alert.alert(
        'Report not submitted',
        reportError?.message || 'Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBarSide}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>{isWhisperReport ? 'Report Whisper' : 'Report account'}</Text>
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
          <View style={styles.notice}>
            <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.text} />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>Reports are private</Text>
              <Text style={styles.noticeBody}>
                {isWhisperReport
                  ? `${displayName} will not be told who reported the Whisper. Its disappearing text will be saved privately as report evidence.`
                  : `${displayName} will not be told who reported them. Include only information relevant to the safety concern.`}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>What happened?</Text>
          <View style={styles.reasonList}>
            {REPORT_REASONS.map((item) => {
              const selected = item.value === reason;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setReason(item.value)}
                  style={({ pressed }) => [
                    styles.reasonRow,
                    selected && styles.reasonRowSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={21}
                    color={COLORS.text}
                  />
                  <View style={styles.reasonCopy}>
                    <Text style={styles.reasonLabel}>{item.label}</Text>
                    <Text style={styles.reasonDescription}>{item.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Additional details</Text>
          <Text style={styles.helperText}>
            Optional. Do not include passwords, financial information, or unrelated private details.
          </Text>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder={selectedReason ? `Describe the ${selectedReason.label.toLowerCase()}…` : 'Describe what happened…'}
            placeholderTextColor="#9a9a9a"
            multiline
            maxLength={2000}
            textAlignVertical="top"
            onFocus={() => {
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 220);
            }}
            style={styles.detailsInput}
          />
          <Text style={styles.characterCount}>{details.length}/2000</Text>

          <View style={styles.blockRow}>
            <View style={styles.blockCopy}>
              <Text style={styles.blockTitle}>Also block this account</Text>
              <Text style={styles.blockDescription}>
                Removes direct access, ends romantic state, and locks any shared Our Circle. Shared group or event history may remain factual.
              </Text>
            </View>
            <Switch
              value={alsoBlock}
              onValueChange={setAlsoBlock}
              trackColor={{ false: '#d8d8d8', true: '#1f1f1f' }}
              thumbColor="#fff"
            />
          </View>

          <Pressable
            onPress={submit}
            disabled={submitting || !reason}
            style={({ pressed }) => [
              styles.submitButton,
              (!reason || submitting) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Submit report</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  flex: { flex: 1 },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  topBarSide: { width: 52 },
  topBarTitle: { flex: 1, textAlign: 'center', fontFamily: 'Manrope_700Bold', fontSize: 17, color: COLORS.text },
  content: { padding: 16, paddingBottom: 48 },
  notice: { flexDirection: 'row', padding: 15, borderRadius: 16, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  noticeCopy: { flex: 1, marginLeft: 12 },
  noticeTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: COLORS.text },
  noticeBody: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, color: COLORS.subtext },
  sectionTitle: { marginTop: 22, marginBottom: 8, fontFamily: 'Manrope_700Bold', fontSize: 15, color: COLORS.text },
  reasonList: { gap: 8 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  reasonRowSelected: { borderColor: COLORS.text, backgroundColor: '#f1f1f1' },
  reasonCopy: { flex: 1, marginLeft: 10 },
  reasonLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: COLORS.text },
  reasonDescription: { marginTop: 3, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 17, color: COLORS.subtext },
  helperText: { marginBottom: 8, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, color: COLORS.subtext },
  detailsInput: { minHeight: 130, padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20, color: COLORS.text },
  characterCount: { marginTop: 5, textAlign: 'right', fontFamily: 'Manrope_500Medium', fontSize: 11, color: COLORS.subtext },
  blockRow: { marginTop: 20, flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  blockCopy: { flex: 1, paddingRight: 14 },
  blockTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: COLORS.text },
  blockDescription: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, color: COLORS.subtext },
  submitButton: { marginTop: 24, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: COLORS.text },
  submitText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
