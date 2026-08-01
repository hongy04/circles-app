import React, { useMemo, useState } from 'react';
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

import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { createCircleAvailabilityPoll } from '../../services/availabilityPollService';

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const dateMatch = String(dateInput || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const time = parseTimeInput(timeInput);
  if (!dateMatch || !time) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const result = new Date(year, month - 1, day, time.hour, time.minute, 0, 0);

  if (
    result.getFullYear() !== year
    || result.getMonth() !== month - 1
    || result.getDate() !== day
  ) {
    return null;
  }

  return result;
}

function buildDefaultOption(dayOffset, id) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return {
    id,
    date: formatDateInput(date),
    start: '7:00 PM',
    end: '9:00 PM',
  };
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

function CreateAvailabilityPollContent({ route, navigation }) {
  const { conversationId, circleName = 'Circle' } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const initialOptions = useMemo(() => [
    buildDefaultOption(1, 'option-1'),
    buildDefaultOption(2, 'option-2'),
  ], []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [options, setOptions] = useState(initialOptions);
  const [nextOptionId, setNextOptionId] = useState(3);
  const [submitting, setSubmitting] = useState(false);

  const updateOption = (id, field, value) => {
    setOptions((current) => current.map((option) => (
      option.id === id ? { ...option, [field]: value } : option
    )));
  };

  const addOption = () => {
    if (options.length >= 6) return;
    const lastDate = options[options.length - 1]?.date;
    const parsedLast = String(lastDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let date;

    if (parsedLast) {
      date = new Date(
        Number(parsedLast[1]),
        Number(parsedLast[2]) - 1,
        Number(parsedLast[3]) + 1
      );
    } else {
      date = new Date();
      date.setDate(date.getDate() + options.length + 1);
    }

    setOptions((current) => [
      ...current,
      {
        id: `option-${nextOptionId}`,
        date: formatDateInput(date),
        start: '7:00 PM',
        end: '9:00 PM',
      },
    ]);
    setNextOptionId((current) => current + 1);
  };

  const removeOption = (id) => {
    if (options.length <= 2) return;
    setOptions((current) => current.filter((option) => option.id !== id));
  };

  const submit = async () => {
    if (submitting) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert('Add a poll title', 'Give the Circle a clear name for this plan.');
      return;
    }

    const parsedOptions = [];
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      const startsAt = parseLocalDateTime(option.date, option.start);
      if (!startsAt) {
        Alert.alert(
          `Check option ${index + 1}`,
          'Use a date like 2026-07-26 and a start time like 7:00 PM or 19:00.'
        );
        return;
      }

      let endsAt = null;
      if (option.end.trim()) {
        endsAt = parseLocalDateTime(option.date, option.end);
        if (!endsAt) {
          Alert.alert(
            `Check option ${index + 1}`,
            'Use an end time like 9:00 PM or 21:00, or leave it blank.'
          );
          return;
        }
        if (endsAt <= startsAt) endsAt.setDate(endsAt.getDate() + 1);
      }

      parsedOptions.push({ startsAt, endsAt });
    }

    const uniqueStarts = new Set(parsedOptions.map((option) => option.startsAt.toISOString()));
    if (uniqueStarts.size !== parsedOptions.length) {
      Alert.alert('Choose different times', 'Each poll option needs a different start time.');
      return;
    }

    setSubmitting(true);
    try {
      const pollId = await createCircleAvailabilityPoll({
        conversationId,
        title: cleanTitle,
        description,
        locationName: location,
        options: parsedOptions,
      });

      navigation.replace('AvailabilityPollDetail', { pollId, conversationId, circleName });
    } catch (error) {
      Alert.alert(
        'Could not create poll',
        error?.message || 'Please check the options and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contextCard}>
            <View style={styles.contextIcon}>
              <Ionicons name="options-outline" size={24} color={theme.colors.text} />
            </View>
            <View style={styles.contextCopy}>
              <Text style={styles.contextTitle}>Find a time for {circleName}</Text>
              <Text style={styles.contextBody}>
                Members can select every option that works. Finalizing a date
                creates a normal private event, not an automatic RSVP.
              </Text>
            </View>
          </View>

          <Field label="What are you planning?">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Game night"
              placeholderTextColor="#a0a0a0"
              maxLength={120}
              style={styles.input}
            />
          </Field>

          <Field label="Location" hint="Optional — everyone in the Circle can see it.">
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Maya’s place"
              placeholderTextColor="#a0a0a0"
              maxLength={240}
              style={styles.input}
            />
          </Field>

          <Field label="Details" hint="Optional context for the plan.">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Bring a game or snack"
              placeholderTextColor="#a0a0a0"
              maxLength={2000}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textArea]}
            />
          </Field>

          <View style={styles.optionsHeader}>
            <View>
              <Text style={styles.optionsTitle}>Possible times</Text>
              <Text style={styles.optionsHint}>Add 2–6 choices.</Text>
            </View>
            <Text style={styles.optionCount}>{options.length}/6</Text>
          </View>

          {options.map((option, index) => (
            <View key={option.id} style={styles.optionCard}>
              <View style={styles.optionHeader}>
                <Text style={styles.optionTitle}>Option {index + 1}</Text>
                {options.length > 2 ? (
                  <Pressable
                    onPress={() => removeOption(option.id)}
                    hitSlop={8}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Ionicons name="trash-outline" size={20} color={theme.colors.subtext} />
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.smallLabel}>Date</Text>
              <TextInput
                value={option.date}
                onChangeText={(value) => updateOption(option.id, 'date', value)}
                placeholder="2026-07-26"
                placeholderTextColor="#a0a0a0"
                autoCapitalize="none"
                style={styles.input}
              />

              <View style={styles.timeRow}>
                <View style={styles.timeField}>
                  <Text style={styles.smallLabel}>Start</Text>
                  <TextInput
                    value={option.start}
                    onChangeText={(value) => updateOption(option.id, 'start', value)}
                    placeholder="7:00 PM"
                    placeholderTextColor="#a0a0a0"
                    style={styles.input}
                  />
                </View>
                <View style={styles.timeField}>
                  <Text style={styles.smallLabel}>End</Text>
                  <TextInput
                    value={option.end}
                    onChangeText={(value) => updateOption(option.id, 'end', value)}
                    placeholder="9:00 PM"
                    placeholderTextColor="#a0a0a0"
                    style={styles.input}
                  />
                </View>
              </View>
            </View>
          ))}

          {options.length < 6 ? (
            <Pressable
              onPress={addOption}
              style={({ pressed }) => [styles.addOptionButton, pressed && styles.pressed]}
            >
              <Ionicons name="add-circle-outline" size={20} color={theme.colors.text} />
              <Text style={styles.addOptionText}>Add another time</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submitButton,
              (pressed || submitting) && styles.pressed,
            ]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="options" size={19} color="#fff" />
                <Text style={styles.submitText}>Start Availability Poll</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function CreateAvailabilityPollScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CreateAvailabilityPollContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
  keyboardView: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 50,
  },
  contextCard: {
    flexDirection: 'row',
    gap: 13,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
  },
  contextIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  contextCopy: { flex: 1 },
  contextTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  contextBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  field: { marginTop: 20 },
  label: {
    marginBottom: 7,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  hint: {
    marginTop: 6,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  input: {
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
  },
  textArea: { minHeight: 96 },
  optionsHeader: {
    marginTop: 24,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  optionsTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  optionsHint: {
    marginTop: 2,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  optionCount: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  optionCard: {
    marginBottom: 10,
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
  },
  optionHeader: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  smallLabel: {
    marginBottom: 5,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  timeRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  timeField: { flex: 1 },
  addOptionButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  addOptionText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  submitButton: {
    minHeight: 50,
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: theme.welcome.brandInk,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  submitText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  pressed: { opacity: 0.7 },
  });
}
