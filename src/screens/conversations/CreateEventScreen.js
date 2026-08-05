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
import * as ImagePicker from 'expo-image-picker';

import { ThemeAtmosphere } from '../../components/ThemeAtmosphere';
import { EVENT_LOOK_OPTIONS, EventLookArtwork } from '../../components/events/EventLookHero';

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
import { createCircleEvent } from '../../services/eventService';
import { uploadEventCoverPhoto } from '../../services/eventCoverService';
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

function CircleSelectorRow({ title, subtitle, selected, locked = false, onPress }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
        <Ionicons name="people-outline" size={19} color={theme.colors.text} />
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
          color={selected ? '#fff' : theme.colors.subtext}
        />
      </View>
    </Pressable>
  );
}

function CreateEventContent({ route, navigation }) {
  const { conversationId, circleName = 'Circle', repeatFrom = null } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  const [appearanceKey, setAppearanceKey] = useState(repeatFrom?.appearanceKey || 'circle');
  const [coverAsset, setCoverAsset] = useState(null);
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

  const chooseEventCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photos permission needed',
        'Allow photo access to choose a custom event image. Preset Event Looks still work without it.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.9,
      selectionLimit: 1,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setCoverAsset(result.assets[0]);
    }
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
        appearanceKey,
        timezoneName: (() => {
          try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
          } catch {
            return null;
          }
        })(),
      });

      if (coverAsset?.uri) {
        try {
          await uploadEventCoverPhoto({ eventId, asset: coverAsset });
        } catch (coverError) {
          Alert.alert(
            'Event created',
            `Your event is ready, but the custom event photo could not be saved. The ${EVENT_LOOK_OPTIONS.find((option) => option.key === appearanceKey)?.label || 'Circle'} preset will be used for now. You can add the photo from the event page later.

${coverError?.message || ''}`.trim()
          );
        }
      }

      navigation.replace('EventDetail', { eventId, conversationId, circleName });
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
      <ThemeAtmosphere theme={theme} strength={0.74} decals />
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
          {repeatFrom ? (
            <View style={styles.contextCard}>
              <View style={styles.contextIcon}>
                <Ionicons name="refresh-outline" size={20} color={theme.colors.text} />
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
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.text} />
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
                  <Ionicons name="alert-circle-outline" size={18} color={theme.colors.subtext} />
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

          <View style={styles.formCard}>
            <View style={styles.formCardHeading}>
              <View style={styles.formCardIcon}>
                <Ionicons name="calendar-clear-outline" size={18} color={theme.colors.text} />
              </View>
              <Text style={styles.formCardTitle}>Event details</Text>
            </View>

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
          </View>

          <View style={styles.lookCard}>
            <View style={styles.formCardHeading}>
              <View style={styles.formCardIcon}>
                <Ionicons name="sparkles-outline" size={18} color={theme.colors.text} />
              </View>
              <View style={styles.lookHeadingCopy}>
                <Text style={styles.formCardTitle}>Event look</Text>
                <Text style={styles.lookHeadingBody}>Optional · just gives this gathering its own little mood.</Text>
              </View>
            </View>
            <View style={styles.customCoverBlock}>
              <Pressable
                onPress={chooseEventCover}
                style={({ pressed }) => [styles.customCoverPreview, pressed && styles.pressed]}
              >
                <EventLookArtwork appearanceKey={appearanceKey} coverUri={coverAsset?.uri || null} compact>
                  <View style={styles.customCoverOverlay}>
                    <View style={styles.customCoverIcon}>
                      <Ionicons
                        name={coverAsset ? 'images-outline' : 'image-outline'}
                        size={20}
                        color={coverAsset ? '#fff' : theme.colors.text}
                      />
                    </View>
                    <View style={styles.customCoverCopy}>
                      <Text style={[styles.customCoverTitle, coverAsset && styles.customCoverTitleOnPhoto]}>
                        {coverAsset ? 'Custom event photo' : 'Add your own photo'}
                      </Text>
                      <Text style={[styles.customCoverBody, coverAsset && styles.customCoverBodyOnPhoto]}>
                        {coverAsset ? 'Tap to choose a different photo.' : 'Optional · cropped wide for the event header and private guest invite.'}
                      </Text>
                    </View>
                  </View>
                </EventLookArtwork>
              </Pressable>

              {coverAsset ? (
                <Pressable
                  onPress={() => setCoverAsset(null)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.removeCoverButton, pressed && styles.pressed]}
                >
                  <Ionicons name="close-circle-outline" size={16} color={theme.colors.subtext} />
                  <Text style={styles.removeCoverText}>Use preset instead</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.presetLabel}>PRESET FALLBACK</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.lookGrid}
            >
              {EVENT_LOOK_OPTIONS.map((option) => {
                const selected = appearanceKey === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setAppearanceKey(option.key)}
                    style={({ pressed }) => [
                      styles.lookOption,
                      selected && styles.lookOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <EventLookArtwork appearanceKey={option.key} compact>
                      <View style={styles.lookOptionOverlay}>
                        <Ionicons name={option.icon} size={17} color={option.key === 'twilight' ? '#fff' : theme.colors.text} />
                      </View>
                    </EventLookArtwork>
                    <View style={styles.lookOptionLabelRow}>
                      <Text style={styles.lookOptionLabel}>{option.label}</Text>
                      {selected ? (
                        <View style={styles.lookCheck}>
                          <Ionicons name="checkmark" size={11} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

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

export function CreateEventScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CreateEventContent {...props} />
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
    borderColor: accentLine,
    backgroundColor: glass,
    shadowColor: '#000',
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  contextIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accentWash,
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
    lineHeight: 17,
  },
  circleSection: {
    marginBottom: 20,
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    shadowColor: '#000',
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  circleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  circleSectionTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  circleSectionBody: {
    maxWidth: 420,
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  circleSelectionCount: {
    color: theme.colors.subtext,
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
    borderColor: accentLine,
    backgroundColor: glassStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  circleSelectorRowSelected: {
    borderColor: theme.circle.accent,
    backgroundColor: accentWash,
  },
  circleSelectorIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glassStrong,
  },
  circleSelectorCopy: { flex: 1 },
  circleSelectorTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  circleSelectorSubtitle: {
    marginTop: 2,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  circleCheckbox: {
    width: 27,
    height: 27,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glassStrong,
  },
  circleCheckboxSelected: {
    borderColor: theme.circle.accent,
    backgroundColor: theme.circle.accent,
  },
  circleLoadState: {
    minHeight: 54,
    marginTop: 8,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: accentWash,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleLoadText: {
    flex: 1,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  noOtherCircles: {
    marginTop: 10,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  formCard: {
    marginBottom: 20,
    padding: 15,
    paddingBottom: 2,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    shadowColor: '#000',
    shadowOpacity: 0.045,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  formCardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 15,
  },
  formCardIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accentWash,
  },
  formCardTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  field: { marginBottom: 17 },
  label: {
    marginBottom: 7,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  hint: {
    marginTop: 5,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glassStrong,
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
  },
  textArea: { minHeight: 112 },
  twoColumnRow: { flexDirection: 'row', gap: 10 },
  columnField: { flex: 1 },
  lookCard: {
    marginBottom: 20,
    padding: 15,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  lookHeadingCopy: { flex: 1 },
  lookHeadingBody: {
    marginTop: 2,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 14,
  },
  customCoverBlock: { marginBottom: 12, gap: 7 },
  customCoverPreview: {
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: accentLine,
  },
  customCoverOverlay: {
    minHeight: 92,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  customCoverIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  customCoverCopy: { flex: 1, gap: 2 },
  customCoverTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  customCoverTitleOnPhoto: { color: '#fff', textShadowColor: 'rgba(0,0,0,0.30)', textShadowRadius: 4 },
  customCoverBody: { color: theme.colors.subtext, fontFamily: 'Manrope_500Medium', fontSize: 10, lineHeight: 14 },
  customCoverBodyOnPhoto: { color: 'rgba(255,255,255,0.88)', textShadowColor: 'rgba(0,0,0,0.28)', textShadowRadius: 4 },
  removeCoverButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  removeCoverText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  presetLabel: { marginBottom: 7, color: theme.colors.subtext, fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 0.8 },
  lookGrid: {
    gap: 9,
    paddingRight: 4,
  },
  lookOption: {
    width: 104,
    padding: 4,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: glassStrong,
  },
  lookOptionSelected: {
    borderColor: theme.circle.accent,
    backgroundColor: accentWash,
  },
  lookOptionOverlay: {
    flex: 1,
    minHeight: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookOptionLabelRow: {
    minHeight: 31,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  lookOptionLabel: {
    flexShrink: 1,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  lookCheck: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accent,
  },
  guestSettingsCard: {
    marginBottom: 20,
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    shadowColor: '#000',
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  settingRowSpaced: { marginTop: 18 },
  settingCopy: { flex: 1 },
  settingTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  settingBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  guestDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
    backgroundColor: theme.colors.border,
  },
  submitButton: {
    minHeight: 50,
    marginTop: 7,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: theme.welcome.brandInk,
  },
  submitText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  pressed: { opacity: 0.72 },
  });
}
