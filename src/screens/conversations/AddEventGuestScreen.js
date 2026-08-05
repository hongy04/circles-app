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

import { ThemeAtmosphere } from '../../components/ThemeAtmosphere';
import { EventRoomSectionHero } from '../../components/events/EventRoomSectionHero';

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
import { addEventGuest } from '../../services/eventService';
import {
  createEventGuestInvitation,
  shareCreatedEventGuestInvitation,
} from '../../services/eventGuestInviteService';

const RESPONSE_OPTIONS = [
  { value: 'invited', label: 'Invited' },
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'not_going', label: 'Can’t go' },
];

function ChoiceButton({ selected, label, icon, onPress, disabled = false, styles, theme }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.choiceButton,
        selected && styles.choiceButtonSelected,
        disabled && styles.choiceButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={selected ? '#fff' : disabled ? theme.colors.legal : theme.colors.text}
      />
      <Text style={[
        styles.choiceButtonText,
        selected && styles.choiceButtonTextSelected,
        disabled && styles.choiceButtonTextDisabled,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AddEventGuestContent({ route, navigation }) {
  const {
    eventId,
    eventTitle = 'an event',
    allowPlusOnes = false,
    remainingGuestSlots = 0,
    guestInviteLinksEnabled = true,
    appearanceKey = 'circle',
    coverUri = null,
  } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState(guestInviteLinksEnabled ? 'invite' : 'manual');
  const [displayName, setDisplayName] = useState('');
  const [guestType, setGuestType] = useState('guest');
  const [status, setStatus] = useState('invited');
  const [submitting, setSubmitting] = useState(false);

  const createAndShare = async () => {
    if (submitting) return;

    setSubmitting(true);
    let invitation = null;
    try {
      invitation = await createEventGuestInvitation({ eventId, guestType });
      await shareCreatedEventGuestInvitation({ invite: invitation, eventTitle });
      navigation.goBack();
    } catch (error) {
      if (invitation) {
        Alert.alert(
          'Invitation created',
          'The guest spot is reserved, but the share sheet did not finish. Return to the event to share the pending invitation again.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert(
          'Could not create invitation',
          error?.message || 'Please check the guest settings and try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const addManually = async () => {
    if (submitting) return;
    const cleanName = displayName.trim();

    if (!cleanName) {
      Alert.alert('Add a guest name', 'Use the name people at the event will recognize.');
      return;
    }

    setSubmitting(true);
    try {
      await addEventGuest({
        eventId,
        displayName: cleanName,
        guestType,
        status,
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'Could not add guest',
        error?.message || 'Please check the guest settings and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ThemeAtmosphere theme={theme} strength={0.60} decals />
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
          <EventRoomSectionHero
            appearanceKey={appearanceKey}
            coverUri={coverUri}
            eventTitle={eventTitle}
            eyebrow="OUTSIDE GUESTS"
            title={mode === 'invite' ? 'Invite someone in' : 'Add someone manually'}
            body={mode === 'invite'
              ? 'Send a private event link and let your guest enter their own name and RSVP.'
              : 'For someone who replied elsewhere, add only the details the event needs.'}
            icon={mode === 'invite' ? 'link-outline' : 'person-add-outline'}
            trailingLabel={`${remainingGuestSlots} ${remainingGuestSlots === 1 ? 'spot' : 'spots'} left`}
          />

          <View style={styles.contextCard}>
            <View style={styles.contextIcon}>
              <Ionicons name="shield-checkmark-outline" size={21} color={theme.colors.text} />
            </View>
            <View style={styles.contextCopy}>
              <Text style={styles.contextTitle}>Private event access only</Text>
              <Text style={styles.contextBody}>
                Guest links do not open private profiles, Circle posts, chats, or unrelated events.
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Invitation type</Text>
          <View style={styles.choiceRow}>
            <ChoiceButton
              selected={guestType === 'guest'}
              label="Guest"
              icon="person-outline"
              onPress={() => setGuestType('guest')}
              styles={styles}
              theme={theme}
            />
            <ChoiceButton
              selected={guestType === 'plus_one'}
              label="My plus-one"
              icon="people-outline"
              onPress={() => setGuestType('plus_one')}
              disabled={!allowPlusOnes}
              styles={styles}
              theme={theme}
            />
          </View>
          {!allowPlusOnes ? (
            <Text style={styles.hint}>The host has not enabled plus-ones for this event.</Text>
          ) : null}

          {mode === 'invite' ? (
            <>
              <View style={styles.explainerCard}>
                <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.text} />
                <Text style={styles.explainerText}>
                  This reserves one guest spot. The private link reveals only the event information needed to RSVP—not private Circles, profiles, posts, or messages.
                </Text>
              </View>

              <Pressable
                onPress={createAndShare}
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
                    <Ionicons name="share-outline" size={19} color="#fff" />
                    <Text style={styles.submitText}>Create & Share Invite</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => setMode('manual')}
                disabled={submitting}
                style={({ pressed }) => [styles.modeButton, pressed && styles.pressed]}
              >
                <Text style={styles.modeButtonText}>Add manually instead</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.label, styles.sectionLabel]}>Guest name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Maya Chen"
                placeholderTextColor={theme.colors.subtext}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={80}
                style={styles.input}
              />

              <Text style={[styles.label, styles.sectionLabel]}>Response</Text>
              <View style={styles.responseGrid}>
                {RESPONSE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => setStatus(option.value)}
                    style={({ pressed }) => [
                      styles.responseButton,
                      status === option.value && styles.responseButtonSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[
                      styles.responseButtonText,
                      status === option.value && styles.responseButtonTextSelected,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={addManually}
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
                    <Ionicons name="person-add-outline" size={19} color="#fff" />
                    <Text style={styles.submitText}>Add Guest Manually</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => setMode('invite')}
                disabled={submitting}
                style={({ pressed }) => [styles.modeButton, pressed && styles.pressed]}
              >
                <Text style={styles.modeButtonText}>Back to private invite link</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AddEventGuestScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <AddEventGuestContent {...props} />
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
    maxWidth: 620,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 46,
  },
  contextCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    marginTop: 12,
    marginBottom: 22,
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
    width: 44,
    height: 44,
    borderRadius: 14,
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
    marginTop: 4,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  label: {
    marginBottom: 8,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  sectionLabel: { marginTop: 22 },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
  },
  choiceRow: { flexDirection: 'row', gap: 9 },
  choiceButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glassStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  choiceButtonSelected: {
    borderColor: theme.circle.accent,
    backgroundColor: theme.circle.accent,
  },
  choiceButtonDisabled: { backgroundColor: rgba(theme.colors.surface, 0.58) },
  choiceButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  choiceButtonTextSelected: { color: '#fff' },
  choiceButtonTextDisabled: { color: '#a9a9a9' },
  explainerCard: {
    marginTop: 22,
    padding: 15,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  explainerText: {
    flex: 1,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 17,
  },
  responseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  responseButton: {
    width: '48%',
    minHeight: 44,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  responseButtonSelected: {
    borderColor: theme.circle.accent,
    backgroundColor: theme.circle.accent,
  },
  responseButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  responseButtonTextSelected: { color: '#fff' },
  hint: {
    marginTop: 7,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  submitButton: {
    minHeight: 50,
    marginTop: 28,
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
    fontSize: 15,
  },
  modeButton: {
    minHeight: 44,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: rgba(theme.colors.surface, 0.66),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,

  },
  pressed: { opacity: 0.72 },
  });
}
