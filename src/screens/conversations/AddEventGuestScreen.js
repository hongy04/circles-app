import React, { useState } from 'react';
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
import { addEventGuest } from '../../services/eventService';

const RESPONSE_OPTIONS = [
  { value: 'invited', label: 'Invited' },
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'not_going', label: 'Can’t go' },
];

function ChoiceButton({ selected, label, icon, onPress, disabled = false }) {
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
        color={selected ? '#fff' : disabled ? '#b8b8b8' : COLORS.text}
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

export function AddEventGuestScreen({ route, navigation }) {
  const {
    eventId,
    allowPlusOnes = false,
    remainingGuestSlots = 0,
  } = route.params || {};
  const [displayName, setDisplayName] = useState('');
  const [guestType, setGuestType] = useState('guest');
  const [status, setStatus] = useState('invited');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
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
              <Ionicons name="person-add-outline" size={22} color={COLORS.text} />
            </View>
            <View style={styles.contextCopy}>
              <Text style={styles.contextTitle}>Add a named outside guest</Text>
              <Text style={styles.contextBody}>
                {remainingGuestSlots} guest {remainingGuestSlots === 1 ? 'spot' : 'spots'} remaining.
                This person will not receive Circle, profile, or message access.
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Guest name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Maya Chen"
            placeholderTextColor="#a4a4a4"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={80}
            style={styles.input}
          />

          <Text style={[styles.label, styles.sectionLabel]}>Guest type</Text>
          <View style={styles.choiceRow}>
            <ChoiceButton
              selected={guestType === 'guest'}
              label="Guest"
              icon="person-outline"
              onPress={() => setGuestType('guest')}
            />
            <ChoiceButton
              selected={guestType === 'plus_one'}
              label="Plus-one"
              icon="people-outline"
              onPress={() => setGuestType('plus_one')}
              disabled={!allowPlusOnes}
            />
          </View>
          {!allowPlusOnes ? (
            <Text style={styles.hint}>The host has not enabled plus-ones for this event.</Text>
          ) : null}

          <Text style={[styles.label, styles.sectionLabel]}>Current response</Text>
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
          <Text style={styles.hint}>
            Until web RSVPs are added, the host or inviter can update this when the guest responds.
          </Text>

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
                <Ionicons name="person-add-outline" size={19} color="#fff" />
                <Text style={styles.submitText}>Add Guest</Text>
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
    maxWidth: 620,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 46,
  },
  contextCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    marginBottom: 22,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  contextIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  label: {
    marginBottom: 8,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  sectionLabel: { marginTop: 22 },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
  },
  choiceRow: { flexDirection: 'row', gap: 9 },
  choiceButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  choiceButtonSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  choiceButtonDisabled: { backgroundColor: '#f3f3f3' },
  choiceButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  choiceButtonTextSelected: { color: '#fff' },
  choiceButtonTextDisabled: { color: '#a9a9a9' },
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  responseButtonSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  responseButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  responseButtonTextSelected: { color: '#fff' },
  hint: {
    marginTop: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  submitButton: {
    minHeight: 50,
    marginTop: 28,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
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
  pressed: { opacity: 0.72 },
});
