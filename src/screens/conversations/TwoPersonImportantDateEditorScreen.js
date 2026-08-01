import React, { useEffect, useMemo, useRef, useState } from 'react';
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

import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  createTwoPersonImportantDate,
  deleteTwoPersonImportantDate,
  getTwoPersonImportantDate,
  updateTwoPersonImportantDate,
} from '../../services/twoPersonImportantDateService';

const CATEGORIES = Object.freeze([
  { key: 'anniversary', label: 'Anniversary', icon: 'heart-outline' },
  { key: 'birthday', label: 'Birthday', icon: 'gift-outline' },
  { key: 'trip', label: 'Trip', icon: 'airplane-outline' },
  { key: 'tradition', label: 'Tradition', icon: 'repeat-outline' },
  { key: 'meaningful', label: 'Meaningful', icon: 'star-outline' },
]);

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== monthIndex
    || date.getDate() !== day
  ) return null;
  return formatDateInput(date);
}

function Field({ label, hint, children, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function TwoPersonImportantDateEditorContent({ route, navigation }) {
  const {
    conversationId,
    circleName = 'Our Circle',
    importantDateId = null,
  } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [dateInput, setDateInput] = useState(formatDateInput(nextMonth));
  const [category, setCategory] = useState('meaningful');
  const [recursYearly, setRecursYearly] = useState(false);
  const [loading, setLoading] = useState(Boolean(importantDateId));
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
    if (!importantDateId) return () => { active = false; };

    (async () => {
      try {
        const item = await getTwoPersonImportantDate(importantDateId);
        if (!active) return;
        setTitle(item.title);
        setNote(item.note);
        setDateInput(item.dateValue || '');
        setCategory(item.category || 'meaningful');
        setRecursYearly(item.recurrence === 'yearly');
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not open this important date.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [importantDateId]);

  const save = async () => {
    if (submitting) return;
    const cleanTitle = title.trim();
    const validDate = parseDateInput(dateInput);

    if (!cleanTitle) {
      Alert.alert('Add a title', 'Name the date you want to remember.');
      return;
    }
    if (!validDate) {
      Alert.alert('Check the date', 'Use a valid date like 2026-08-14.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      if (importantDateId) {
        await updateTwoPersonImportantDate({
          importantDateId,
          title: cleanTitle,
          note,
          dateValue: validDate,
          category,
          recurrence: recursYearly ? 'yearly' : 'none',
        });
      } else {
        await createTwoPersonImportantDate({
          conversationId,
          title: cleanTitle,
          note,
          dateValue: validDate,
          category,
          recurrence: recursYearly ? 'yearly' : 'none',
        });
      }
      navigation.goBack();
    } catch (saveError) {
      setError(saveError?.message || 'Could not save this important date.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = () => {
    if (!importantDateId || submitting) return;
    Alert.alert(
      'Remove important date?',
      'This removes it from the shared Circle for both people.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            setError('');
            try {
              await deleteTwoPersonImportantDate(importantDateId);
              navigation.goBack();
            } catch (removeError) {
              setError(removeError?.message || 'Could not remove this date.');
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.stateText}>Opening important date…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
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
            <View style={styles.contextIcon}>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.text} />
            </View>
            <View style={styles.contextCopy}>
              <Text style={styles.contextTitle}>{circleName}</Text>
              <Text style={styles.contextBody}>
                Save only the dates that carry meaning for the two of you. No streaks, scores, or required check-ins.
              </Text>
            </View>
          </View>

          <Field label="What date matters?" styles={styles}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Our anniversary"
              placeholderTextColor={theme.colors.subtext}
              maxLength={100}
              onFocus={keepFieldVisible}
              style={styles.input}
            />
          </Field>

          <Field label="Type" styles={styles}>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((item) => {
                const selected = category === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setCategory(item.key)}
                    style={({ pressed }) => [
                      styles.categoryChip,
                      selected && styles.categoryChipSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={15}
                      color={selected ? '#fff' : theme.colors.text}
                    />
                    <Text style={[
                      styles.categoryText,
                      selected && styles.categoryTextSelected,
                    ]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Date" hint="Use YYYY-MM-DD, for example 2026-08-14." styles={styles}>
            <TextInput
              value={dateInput}
              onChangeText={setDateInput}
              placeholder="2026-08-14"
              placeholderTextColor={theme.colors.subtext}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              maxLength={10}
              onFocus={keepFieldVisible}
              style={styles.input}
            />
          </Field>

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Repeat every year</Text>
              <Text style={styles.toggleBody}>
                Best for anniversaries, birthdays, and recurring traditions.
              </Text>
            </View>
            <Switch
              value={recursYearly}
              onValueChange={setRecursYearly}
              trackColor={{ false: theme.colors.border, true: theme.circle.accent }}
            />
          </View>

          <Field label="Why it matters" hint="Optional · a private note shared only in this Circle." styles={styles}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="A small note about the meaning behind this date"
              placeholderTextColor={theme.colors.subtext}
              maxLength={800}
              multiline
              textAlignVertical="top"
              onFocus={keepFieldVisible}
              style={[styles.input, styles.textArea]}
            />
          </Field>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            disabled={submitting}
            onPress={save}
            style={({ pressed }) => [
              styles.primaryButton,
              submitting && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : null}
            <Text style={styles.primaryButtonText}>
              {importantDateId ? 'Save Changes' : 'Add Important Date'}
            </Text>
          </Pressable>

          {importantDateId ? (
            <Pressable
              disabled={submitting}
              onPress={remove}
              style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
            >
              <Text style={styles.removeButtonText}>Remove Important Date</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function TwoPersonImportantDateEditorScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <TwoPersonImportantDateEditorContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    keyboardView: { flex: 1 },
    content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 150 },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.profileBackground,
      gap: 10,
    },
    stateText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    contextCard: {
      padding: 14,
      borderRadius: 15,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    contextIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: theme.circle.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contextCopy: { flex: 1 },
    contextTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    contextBody: {
      marginTop: 3,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 11.5,
      lineHeight: 17,
    },
    field: { marginTop: 18 },
    label: { marginBottom: 7, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    hint: {
      marginTop: 6,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 10.5,
      lineHeight: 15,
    },
    input: {
      minHeight: 46,
      paddingHorizontal: 13,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      color: theme.colors.text,
      fontFamily: 'Manrope_400Regular',
      fontSize: 14,
    },
    textArea: { minHeight: 110 },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    categoryChip: {
      minHeight: 38,
      paddingHorizontal: 11,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    categoryChipSelected: { backgroundColor: theme.welcome.brandInk, borderColor: theme.welcome.brandInk },
    categoryText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 11 },
    categoryTextSelected: { color: '#fff' },
    toggleRow: {
      marginTop: 18,
      padding: 14,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    toggleCopy: { flex: 1 },
    toggleTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    toggleBody: {
      marginTop: 3,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 10.5,
      lineHeight: 15,
    },
    errorText: { marginTop: 14, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    primaryButton: {
      marginTop: 20,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: theme.welcome.brandInk,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
    removeButton: { marginTop: 10, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    removeButtonText: { color: '#b42318', fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
    disabled: { opacity: 0.55 },
    pressed: { opacity: 0.72 },
  });
}
