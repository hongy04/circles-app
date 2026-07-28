import React, { useEffect, useMemo, useState } from 'react';
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
import { createCircleEvent } from '../../services/eventService';
import { listMyConversations } from '../../services/conversationService';
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
} from '../../services/featureFlagService';

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

function CircleSelectorRow({ title, subtitle, selected, locked = false, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      style={({ pressed }) => [
        styles.circleSelectorRow,
        selected && styles.circleSelectorRowSelected,
        pressed && !locked && styles.pressed,
      ]}
    >
      <View style={styles.circleSelectorIcon}>
        <Ionicons name="people-outline" size={19} color={COLORS.text} />
      </View>
      <View style={styles.circleSelectorCopy}>
        <Text style={styles.circleSelectorTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.circleSelectorSubtitle}>{subtitle}</Text>
      </View>
      <View style={[
        styles.circleCheckbox,
        selected && styles.circleCheckboxSelected,
      ]}>
        <Ionicons
          name={locked ? 'lock-closed' : selected ? 'checkmark' : 'add'}
          size={14}
          color={selected ? '#fff' : COLORS.subtext}
        />
      </View>
    </Pressable>
  );
}

export function CreateEventScreen({ route, navigation }) {
  const { conversationId, circleName = 'Circle', repeatFrom = null } = route.params || {};
  const defaults = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      date: formatDateInput(tomorrow),
      start: '7:00 PM',
      end: '9:00 PM',
    };
  }, []);

  const [title, setTitle] = useState(repeatFrom?.title || '');
  const [description, setDescription] = useState(repeatFrom?.description || '');
  const [dateInput, setDateInput] = useState(defaults.date);
  const [startInput, setStartInput] = useState(defaults.start);
  const [endInput, setEndInput] = useState(defaults.end);
  const [location, setLocation] = useState(repeatFrom?.locationName || '');
  const [submitting, setSubmitting] = useState(false);
  const [multiCircleEnabled, setMultiCircleEnabled] = useState(false);
  const [availableCircles, setAvailableCircles] = useState([]);
  const [selectedAdditionalCircleIds, setSelectedAdditionalCircleIds] = useState(
    (repeatFrom?.circleIds || []).filter((circleId) => circleId && circleId !== conversationId)
  );
  const [loadingCircles, setLoadingCircles] = useState(true);
  const [circleLoadError, setCircleLoadError] = useState('');
  const [outsideGuestsEnabled, setOutsideGuestsEnabled] = useState(false);
  const repeatGuestCap = Number(repeatFrom?.outsideGuestCap || 0);
  const [allowOutsideGuests, setAllowOutsideGuests] = useState(repeatGuestCap > 0);
  const [guestCapInput, setGuestCapInput] = useState(
    repeatGuestCap > 0 ? String(repeatGuestCap) : '4'
  );
  const [membersCanInviteGuests, setMembersCanInviteGuests] = useState(
    repeatGuestCap > 0 && Boolean(repeatFrom?.membersCanInviteGuests)
  );
  const [allowPlusOnes, setAllowPlusOnes] = useState(
    repeatGuestCap > 0 && Boolean(repeatFrom?.allowPlusOnes)
  );

  useEffect(() => {
    let active = true;

    (async () => {
      const [multiCircleAvailable, outsideGuestAvailable] = await Promise.all([
        isFeatureEnabled(FEATURE_FLAGS.MULTI_CIRCLE_EVENTS),
        isFeatureEnabled(FEATURE_FLAGS.EVENT_OUTSIDE_GUESTS),
      ]);
      if (!active) return;
      setMultiCircleEnabled(multiCircleAvailable);
      setOutsideGuestsEnabled(outsideGuestAvailable);
      if (!outsideGuestAvailable) {
        setAllowOutsideGuests(false);
        setMembersCanInviteGuests(false);
        setAllowPlusOnes(false);
      }

      if (!multiCircleAvailable) {
        setSelectedAdditionalCircleIds([]);
        setLoadingCircles(false);
        return;
      }

      try {
        const conversations = await listMyConversations();
        if (!active) return;
        const nextCircles = conversations
          .filter((conversation) => (
            conversation.kind === 'group'
            && conversation.id !== conversationId
          ))
          .sort((a, b) => a.title.localeCompare(b.title));
        setAvailableCircles(nextCircles);
        setSelectedAdditionalCircleIds((current) => current.filter((circleId) => (
          nextCircles.some((conversation) => conversation.id === circleId)
        )));
      } catch (error) {
        if (!active) return;
        setCircleLoadError(error?.message || 'Other Circles could not load.');
      } finally {
        if (active) setLoadingCircles(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [conversationId]);

  const selectedCircleCount = 1 + selectedAdditionalCircleIds.length;

  const toggleAdditionalCircle = (circleId) => {
    setSelectedAdditionalCircleIds((current) => (
      current.includes(circleId)
        ? current.filter((id) => id !== circleId)
        : [...current, circleId]
    ));
  };

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

    const guestCap = allowOutsideGuests ? Number(guestCapInput) : 0;
    if (allowOutsideGuests && (!Number.isInteger(guestCap) || guestCap < 1 || guestCap > 50)) {
      Alert.alert('Check the guest limit', 'Choose a whole number from 1 to 50.');
      return;
    }

    setSubmitting(true);
    try {
      const eventId = await createCircleEvent({
        conversationIds: [conversationId, ...selectedAdditionalCircleIds],
        title: cleanTitle,
        description,
        startsAt,
        endsAt,
        locationName: location,
        outsideGuestCap: guestCap,
        membersCanInviteGuests: allowOutsideGuests && membersCanInviteGuests,
        allowPlusOnes: allowOutsideGuests && allowPlusOnes,
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
          {repeatFrom ? (
            <View style={styles.contextCard}>
              <View style={styles.contextIcon}>
                <Ionicons name="refresh-outline" size={20} color={COLORS.text} />
              </View>
              <View style={styles.contextCopy}>
                <Text style={styles.contextTitle}>Planning another gathering</Text>
                <Text style={styles.contextBody}>
                  The title, location, Circle selection, and guest rules were copied as editable starting points. No prior guest or RSVP is carried into the new event.
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.contextCard}>
            <View style={styles.contextIcon}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.text} />
            </View>
            <View style={styles.contextCopy}>
              <Text style={styles.contextTitle}>{circleName}</Text>
              <Text style={styles.contextBody}>
                {selectedCircleCount === 1
                  ? 'This event is private to current members of this Circle.'
                  : `This event will be shared privately across ${selectedCircleCount} Circles.`}
                {' '}
                {allowOutsideGuests
                  ? 'Named outside guests can be added within the host’s limit.'
                  : 'No one outside the selected Circles is invited.'}
              </Text>
            </View>
          </View>

          {multiCircleEnabled ? (
            <View style={styles.circleSection}>
              <View style={styles.circleSectionHeader}>
                <View>
                  <Text style={styles.circleSectionTitle}>Invite Circles</Text>
                  <Text style={styles.circleSectionBody}>
                    Everyone in each selected Circle can view the event and RSVP.
                  </Text>
                </View>
                <Text style={styles.circleSelectionCount}>{selectedCircleCount} selected</Text>
              </View>

              <CircleSelectorRow
                title={circleName}
                subtitle="Starting Circle · always included"
                selected
                locked
              />

              {loadingCircles ? (
                <View style={styles.circleLoadState}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.circleLoadText}>Loading your other Circles…</Text>
                </View>
              ) : circleLoadError ? (
                <View style={styles.circleLoadState}>
                  <Ionicons name="alert-circle-outline" size={18} color={COLORS.subtext} />
                  <Text style={styles.circleLoadText}>{circleLoadError}</Text>
                </View>
              ) : availableCircles.length > 0 ? (
                availableCircles.map((circle) => (
                  <CircleSelectorRow
                    key={circle.id}
                    title={circle.title}
                    subtitle={`${circle.memberCount || 0} members`}
                    selected={selectedAdditionalCircleIds.includes(circle.id)}
                    onPress={() => toggleAdditionalCircle(circle.id)}
                  />
                ))
              ) : (
                <Text style={styles.noOtherCircles}>
                  Join another group Circle to combine groups in one event.
                </Text>
              )}
            </View>
          ) : null}

          <Field label="Event title">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Game night"
              placeholderTextColor="#a4a4a4"
              maxLength={120}
              style={styles.input}
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

          {outsideGuestsEnabled ? (
            <View style={styles.guestSettingsCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Allow outside guests</Text>
                  <Text style={styles.settingBody}>
                    Add named guests without giving them private Circle or profile access.
                  </Text>
                </View>
                <Switch
                  value={allowOutsideGuests}
                  onValueChange={(value) => {
                    setAllowOutsideGuests(value);
                    if (!value) {
                      setMembersCanInviteGuests(false);
                      setAllowPlusOnes(false);
                    }
                  }}
                />
              </View>

              {allowOutsideGuests ? (
                <>
                  <View style={styles.guestDivider} />
                  <Field label="Outside guest limit" hint="Maximum 50 named guests and plus-ones combined">
                    <TextInput
                      value={guestCapInput}
                      onChangeText={(value) => setGuestCapInput(value.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      maxLength={2}
                      style={styles.input}
                    />
                  </Field>

                  <View style={styles.settingRow}>
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingTitle}>Let members add guests</Text>
                      <Text style={styles.settingBody}>
                        Otherwise only the event host can add or remove outside guests.
                      </Text>
                    </View>
                    <Switch
                      value={membersCanInviteGuests}
                      onValueChange={setMembersCanInviteGuests}
                    />
                  </View>

                  <View style={[styles.settingRow, styles.settingRowSpaced]}>
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingTitle}>Allow plus-ones</Text>
                      <Text style={styles.settingBody}>
                        Plus-ones still count toward the same host-controlled guest limit.
                      </Text>
                    </View>
                    <Switch
                      value={allowPlusOnes}
                      onValueChange={setAllowPlusOnes}
                    />
                  </View>
                </>
              ) : null}
            </View>
          ) : null}

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
  circleSection: {
    marginBottom: 20,
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  circleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  circleSectionTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  circleSectionBody: {
    maxWidth: 420,
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  circleSelectionCount: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  circleSelectorRow: {
    minHeight: 60,
    marginTop: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#fafafa',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  circleSelectorRowSelected: {
    borderColor: COLORS.text,
    backgroundColor: '#f1f1f1',
  },
  circleSelectorIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  circleSelectorCopy: { flex: 1 },
  circleSelectorTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  circleSelectorSubtitle: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  circleCheckbox: {
    width: 27,
    height: 27,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  circleCheckboxSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  circleLoadState: {
    minHeight: 54,
    marginTop: 8,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: '#f7f7f7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleLoadText: {
    flex: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  noOtherCircles: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
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
  guestSettingsCard: {
    marginBottom: 20,
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  settingRowSpaced: { marginTop: 18 },
  settingCopy: { flex: 1 },
  settingTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  settingBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  guestDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
    backgroundColor: COLORS.border,
  },
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
