import React, { useEffect, useMemo, useRef, useState } from 'react';
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

import { ThemeAtmosphere } from '../../components/ThemeAtmosphere';

import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(77,185,229,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
import {
  createTwoPersonPlanIdea,
  getTwoPersonPlan,
  proposeTwoPersonPlan,
  updateTwoPersonPlanIdea,
} from '../../services/twoPersonPlanService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function parseTimeInput(value) {
  const normalized = String(value || '').trim().toUpperCase();
  let match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (match[3] === 'AM' && hour === 12) hour = 0;
    if (match[3] === 'PM' && hour !== 12) hour += 12;
    return { hour, minute };
  }

  match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseLocalDateTime(dateInput, timeInput) {
  const match = String(dateInput || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const time = parseTimeInput(timeInput);
  if (!match || !time) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = new Date(year, month - 1, day, time.hour, time.minute, 0, 0);
  if (
    result.getFullYear() !== year
    || result.getMonth() !== month - 1
    || result.getDate() !== day
  ) return null;
  return result;
}

function Field({ label, hint, children }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function TwoPersonPlanEditorContent({ route, navigation }) {
  const {
    conversationId,
    circleName = 'Our Circle',
    planId = null,
    initialAction = 'idea',
  } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const tomorrow = useMemo(() => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    value.setHours(19, 0, 0, 0);
    return value;
  }, []);

  const cachedPlan = planId ? readNavigationCache(navigationCacheKeys.plan(planId)) : null;
  const cachedStart = cachedPlan?.startsAt ? new Date(cachedPlan.startsAt) : null;
  const cachedStartValid = cachedStart && !Number.isNaN(cachedStart.getTime());
  const [plan, setPlan] = useState(cachedPlan || null);
  const [title, setTitle] = useState(cachedPlan?.title || '');
  const [note, setNote] = useState(cachedPlan?.note || '');
  const [locationName, setLocationName] = useState(cachedPlan?.locationName || '');
  const [dateInput, setDateInput] = useState(cachedStartValid ? formatDateInput(cachedStart) : formatDateInput(tomorrow));
  const [timeInput, setTimeInput] = useState(cachedStartValid ? formatTimeInput(cachedStart) : formatTimeInput(tomorrow));
  const [loading, setLoading] = useState(Boolean(planId && !cachedPlan));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const keepFieldVisible = (event) => {
    const target = event?.nativeEvent?.target;
    if (!target) return;

    setTimeout(() => {
      const responder = scrollRef.current?.getScrollResponder?.();
      responder?.scrollResponderScrollNativeHandleToKeyboard?.(target, 24, true);
    }, Platform.OS === 'ios' ? 120 : 180);
  };

  useEffect(() => {
    let active = true;
    if (!planId || cachedPlan) return () => { active = false; };

    (async () => {
      try {
        const nextPlan = await getTwoPersonPlan(planId);
        if (!active) return;
        setPlan(nextPlan);
        writeNavigationCache(navigationCacheKeys.plan(planId), nextPlan);
        setTitle(nextPlan.title);
        setNote(nextPlan.note);
        setLocationName(nextPlan.locationName);
        if (nextPlan.startsAt) {
          const date = new Date(nextPlan.startsAt);
          setDateInput(formatDateInput(date));
          setTimeInput(formatTimeInput(date));
        }
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not open this plan.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [cachedPlan, planId]);

  const cleanTitle = title.trim();

  const validateTitle = () => {
    if (!cleanTitle) {
      Alert.alert('Add an idea', 'Give this shared plan a short title.');
      return false;
    }
    return true;
  };

  const openDetail = (nextPlanId) => {
    navigation.replace('TwoPersonPlanDetail', {
      planId: nextPlanId,
      conversationId,
      circleName,
    });
  };

  const saveIdea = async () => {
    if (submitting || !validateTitle()) return;
    setSubmitting(true);
    setError('');
    try {
      if (planId) {
        const updated = await updateTwoPersonPlanIdea({
          planId,
          title: cleanTitle,
          note,
          locationName,
        });
        writeNavigationCache(navigationCacheKeys.plan(updated.id), updated);
        openDetail(updated.id);
      } else {
        const createdId = await createTwoPersonPlanIdea({
          conversationId,
          title: cleanTitle,
          note,
          locationName,
        });
        writeNavigationCache(navigationCacheKeys.plan(createdId), {
          id: createdId,
          conversationId,
          title: cleanTitle,
          note,
          locationName,
          status: 'idea',
          startsAt: null,
          memoryNote: '',
        });
        openDetail(createdId);
      }
    } catch (saveError) {
      setError(saveError?.message || 'Could not save this idea.');
    } finally {
      setSubmitting(false);
    }
  };

  const propose = async () => {
    if (submitting || !validateTitle()) return;
    const startsAt = parseLocalDateTime(dateInput, timeInput);
    if (!startsAt) {
      Alert.alert('Check the date and time', 'Use a date like 2026-08-02 and a time like 7:00 PM.');
      return;
    }
    if (startsAt <= new Date()) {
      Alert.alert('Choose a future time', 'A proposed plan needs a date and time in the future.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      let targetPlanId = planId;
      if (!targetPlanId) {
        targetPlanId = await createTwoPersonPlanIdea({
          conversationId,
          title: cleanTitle,
          note,
          locationName,
        });
      }
      const proposed = await proposeTwoPersonPlan({
        planId: targetPlanId,
        title: cleanTitle,
        note,
        locationName,
        startsAt,
      });
      writeNavigationCache(navigationCacheKeys.plan(proposed.id), proposed);
      openDetail(proposed.id);
    } catch (saveError) {
      setError(saveError?.message || 'Could not send this proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening plan…</Text>
      </SafeAreaView>
    );
  }

  const editingProposal = Boolean(planId) && plan?.status === 'proposed';
  const showProposalFields = initialAction === 'propose' || editingProposal;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ThemeAtmosphere theme={theme} strength={0.72} decals />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contextCard}>
            <Ionicons name="heart-outline" size={18} color={theme.colors.text} />
            <View style={styles.contextCopy}>
              <Text style={styles.contextTitle}>{circleName}</Text>
              <Text style={styles.contextBody}>
                An idea stays lightweight. A date becomes scheduled only after the other person accepts it.
              </Text>
            </View>
          </View>

          <View style={styles.planDetailsCard}>
            <View style={styles.planDetailsHeading}>
              <Ionicons name="sparkles-outline" size={17} color={theme.colors.text} />
              <Text style={styles.planDetailsTitle}>The idea</Text>
            </View>

            <Field label="What do you want to do?">
              <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Dinner somewhere new"
              placeholderTextColor="#9b9b9b"
              maxLength={120}
              style={styles.input}
            />
          </Field>

          <Field label="Notes" hint="Optional · keep it simple or add the details that matter.">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="A small idea, link, or anything you want to remember"
              placeholderTextColor="#9b9b9b"
              maxLength={1200}
              multiline
              textAlignVertical="top"
              onFocus={keepFieldVisible}
              style={[styles.input, styles.textArea]}
            />
          </Field>

            <Field label="Place" hint="Optional until you are ready to propose it.">
              <TextInput
                value={locationName}
                onChangeText={setLocationName}
                placeholder="Restaurant, neighborhood, or address"
                placeholderTextColor="#9b9b9b"
                maxLength={200}
                onFocus={keepFieldVisible}
                style={styles.input}
              />
            </Field>
          </View>

          <View style={styles.proposalSection}>
            <View style={styles.proposalHeadingRow}>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.text} />
              <Text style={styles.proposalHeading}>
                {showProposalFields ? 'Proposed time' : 'Ready to pick a time?'}
              </Text>
            </View>
            <Text style={styles.proposalBody}>
              The other person can accept, mark tentative, or suggest a different version.
            </Text>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text style={styles.smallLabel}>Date</Text>
                <TextInput
                  value={dateInput}
                  onChangeText={setDateInput}
                  placeholder="2026-08-02"
                  placeholderTextColor="#9b9b9b"
                  autoCapitalize="none"
                  onFocus={keepFieldVisible}
                  style={styles.input}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.smallLabel}>Time</Text>
                <TextInput
                  value={timeInput}
                  onChangeText={setTimeInput}
                  placeholder="7:00 PM"
                  placeholderTextColor="#9b9b9b"
                  autoCapitalize="characters"
                  onFocus={keepFieldVisible}
                  style={styles.input}
                />
              </View>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {plan?.status === 'idea' || !planId ? (
            <Pressable
              onPress={saveIdea}
              disabled={submitting}
              style={({ pressed }) => [
                styles.secondaryButton,
                (pressed || submitting) && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {planId ? 'Save Idea' : 'Keep as Idea'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={propose}
            disabled={submitting}
            style={({ pressed }) => [styles.primaryButton, (pressed || submitting) && styles.pressed]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="paper-plane-outline" size={17} color="#fff" />
                <Text style={styles.primaryButtonText}>
                  {editingProposal ? 'Suggest These Changes' : 'Propose This Plan'}
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function TwoPersonPlanEditorScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <TwoPersonPlanEditorContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  const glass = rgba(theme.colors.surface, 0.84);
  const glassStrong = rgba(theme.colors.surface, 0.93);
  const accentLine = rgba(theme.circle.accent, 0.20);
  const accentWash = rgba(theme.circle.accent, 0.10);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  keyboardView: { flex: 1 },
  content: { width: '100%', maxWidth: 650, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 180 },
  contextCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: accentLine, backgroundColor: glass },
  contextCopy: { flex: 1 },
  contextTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  contextBody: { marginTop: 3, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11.5, lineHeight: 17 },
  planDetailsCard: { marginTop: 16, padding: 15, paddingTop: 14, paddingBottom: 1, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, borderColor: accentLine, backgroundColor: glass },
  planDetailsHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: -1 },
  planDetailsTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  field: { marginTop: 18 },
  label: { marginBottom: 7, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  hint: { marginTop: 5, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 10.5, lineHeight: 15 },
  input: { minHeight: 44, paddingHorizontal: 12, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: accentLine, backgroundColor: glassStrong, color: theme.colors.text, fontFamily: 'Manrope_400Regular', fontSize: 13 },
  textArea: { minHeight: 112, paddingTop: 11, paddingBottom: 11 },
  proposalSection: { marginTop: 12, padding: 15, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, borderColor: accentLine, backgroundColor: glass },
  proposalHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  proposalHeading: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  proposalBody: { marginTop: 5, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11.5, lineHeight: 17 },
  dateRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  dateField: { flex: 1.25 },
  timeField: { flex: 1 },
  smallLabel: { marginBottom: 5, color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
  errorText: { marginTop: 14, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12, lineHeight: 17 },
  primaryButton: { minHeight: 46, marginTop: 10, borderRadius: 12, backgroundColor: theme.welcome.brandInk, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  secondaryButton: { minHeight: 44, marginTop: 18, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: accentLine, backgroundColor: accentWash, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: theme.colors.surface },
  stateText: { marginTop: 10, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
  pressed: { opacity: 0.7 },
  });
}
