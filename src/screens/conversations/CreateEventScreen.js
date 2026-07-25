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

import { COLORS } from '../../theme/colors';
import { createCircleEvent } from '../../services/eventService';

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

function Field({ label, hint, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function CreateEventScreen({ route, navigation }) {
  const { conversationId, circleName = 'Circle' } = route.params || {};
  const defaults = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      date: formatDateInput(tomorrow),
      start: '7:00 PM',
      end: '9:00 PM',
    };
  }, []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateInput, setDateInput] = useState(defaults.date);
  const [startInput, setStartInput] = useState(defaults.start);
  const [endInput, setEndInput] = useState(defaults.end);
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert('Add an event title', 'Give the Circle a clear name for this plan.');
      return;
    }

    const startsAt = parseLocalDateTime(dateInput, startInput);
    if (!startsAt) {
      Alert.alert(
        'Check the start time',
        'Use a date like 2026-07-26 and a time like 7:00 PM or 19:00.'
      );
      return;
    }

    let endsAt = null;
    if (endInput.trim()) {
      endsAt = parseLocalDateTime(dateInput, endInput);
      if (!endsAt) {
        Alert.alert(
          'Check the end time',
          'Use a time like 9:00 PM or 21:00, or leave it blank.'
        );
        return;
      }
      if (endsAt <= startsAt) {
        endsAt.setDate(endsAt.getDate() + 1);
      }
    }

    setSubmitting(true);
    try {
      const eventId = await createCircleEvent({
        conversationId,
        title: cleanTitle,
        description,
        startsAt,
        endsAt,
        locationName: location,
      });

      navigation.replace('EventDetail', { eventId });
    } catch (error) {
      Alert.alert(
        'Could not create event',
        error?.message || 'Please check the details and try again.'
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
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contextCard}>
            <View style={styles.contextIcon}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.text} />
            </View>
            <View style={styles.contextCopy}>
              <Text style={styles.contextTitle}>{circleName}</Text>
              <Text style={styles.contextBody}>
                This event is private to current Circle members. Creating it does
                not invite anyone outside the Circle.
              </Text>
            </View>
          </View>

          <Field label="Event title">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Game night"
              placeholderTextColor="#a4a4a4"
              maxLength={120}
              style={styles.input}
              autoFocus
              returnKeyType="next"
            />
          </Field>

          <View style={styles.twoColumnRow}>
            <View style={styles.columnField}>
              <Field label="Date" hint="YYYY-MM-DD">
                <TextInput
                  value={dateInput}
                  onChangeText={setDateInput}
                  placeholder="2026-07-26"
                  placeholderTextColor="#a4a4a4"
                  keyboardType="numbers-and-punctuation"
                  style={styles.input}
                  maxLength={10}
                />
              </Field>
            </View>
          </View>

          <View style={styles.twoColumnRow}>
            <View style={styles.columnField}>
              <Field label="Starts">
                <TextInput
                  value={startInput}
                  onChangeText={setStartInput}
                  placeholder="7:00 PM"
                  placeholderTextColor="#a4a4a4"
                  style={styles.input}
                  maxLength={8}
                />
              </Field>
            </View>
            <View style={styles.columnField}>
              <Field label="Ends" hint="Optional">
                <TextInput
                  value={endInput}
                  onChangeText={setEndInput}
                  placeholder="9:00 PM"
                  placeholderTextColor="#a4a4a4"
                  style={styles.input}
                  maxLength={8}
                />
              </Field>
            </View>
          </View>

          <Field label="Location" hint="Optional">
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Alex’s place"
              placeholderTextColor="#a4a4a4"
              maxLength={240}
              style={styles.input}
            />
          </Field>

          <Field label="Details" hint="Optional">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What should people know or bring?"
              placeholderTextColor="#a4a4a4"
              multiline
              textAlignVertical="top"
              maxLength={2000}
              style={[styles.input, styles.textArea]}
            />
          </Field>

          <Pressable
            onPress={submit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submitButton,
              (pressed || submitting) && styles.pressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="calendar-outline" size={19} color="#fff" />
                <Text style={styles.submitText}>Create Event</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  keyboardView: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 50,
  },
  contextCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 15,
    marginBottom: 20,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  contextIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  contextCopy: { flex: 1 },
  contextTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  contextBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  field: { marginBottom: 17 },
  label: {
    marginBottom: 7,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  hint: {
    marginTop: 5,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
  },
  textArea: { minHeight: 112 },
  twoColumnRow: { flexDirection: 'row', gap: 10 },
  columnField: { flex: 1 },
  submitButton: {
    minHeight: 50,
    marginTop: 7,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: COLORS.primary,
  },
  submitText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  pressed: { opacity: 0.72 },
});
