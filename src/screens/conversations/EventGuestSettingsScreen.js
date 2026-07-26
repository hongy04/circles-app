import React, { useCallback, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../../theme/colors';
import {
  getEventDetails,
  getEventGuestAttendeeVisibility,
  updateEventGuestSettings,
} from '../../services/eventService';

function SettingRow({ title, body, value, onValueChange, disabled = false }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingBody}>{body}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </View>
  );
}

export function EventGuestSettingsScreen({ route, navigation }) {
  const { eventId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const [guestCapInput, setGuestCapInput] = useState('0');
  const [membersCanInviteGuests, setMembersCanInviteGuests] = useState(false);
  const [allowPlusOnes, setAllowPlusOnes] = useState(false);
  const [showAttendeeListToGuests, setShowAttendeeListToGuests] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [details, attendeeVisibility] = await Promise.all([
        getEventDetails(eventId),
        getEventGuestAttendeeVisibility(eventId),
      ]);
      if (!details.event.canManage) {
        throw new Error('Only the event host can change outside guest settings.');
      }
      setGuestCount(details.event.reservedGuestCount);
      setGuestCapInput(String(details.event.outsideGuestCap));
      setMembersCanInviteGuests(details.event.membersCanInviteGuests);
      setAllowPlusOnes(details.event.allowPlusOnes);
      setShowAttendeeListToGuests(attendeeVisibility);
    } catch (loadError) {
      setError(loadError?.message || 'Guest settings could not load.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (saving) return;
    const guestCap = Number(guestCapInput || 0);

    if (!Number.isInteger(guestCap) || guestCap < 0 || guestCap > 50) {
      Alert.alert('Check the guest limit', 'Choose a whole number from 0 to 50.');
      return;
    }

    if (guestCap < guestCount) {
      Alert.alert(
        'Guest limit is too low',
        `This event already has ${guestCount} reserved guest ${guestCount === 1 ? 'spot' : 'spots'}, including pending invitations. Remove guests or revoke invitations first.`
      );
      return;
    }

    setSaving(true);
    try {
      await updateEventGuestSettings({
        eventId,
        outsideGuestCap: guestCap,
        membersCanInviteGuests: guestCap > 0 && membersCanInviteGuests,
        allowPlusOnes: guestCap > 0 && allowPlusOnes,
        showAttendeeListToGuests,
      });
      navigation.goBack();
    } catch (saveError) {
      Alert.alert(
        'Could not save settings',
        saveError?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Loading guest settings…</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="people-outline" size={38} color={COLORS.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const guestCap = Number(guestCapInput || 0);
  const guestsEnabled = Number.isFinite(guestCap) && guestCap > 0;

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
              <Ionicons name="shield-checkmark-outline" size={23} color={COLORS.text} />
            </View>
            <View style={styles.contextCopy}>
              <Text style={styles.contextTitle}>Host-controlled guest access</Text>
              <Text style={styles.contextBody}>
                Guest invitations and claimed guests appear only in this private event. They do not gain profile, Circle, message, or onward-invitation access.
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Outside guest limit</Text>
          <TextInput
            value={guestCapInput}
            onChangeText={(value) => setGuestCapInput(value.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={2}
            style={styles.input}
          />
          <Text style={styles.hint}>
            Use 0 to turn outside guests off. Currently reserved guest spots: {guestCount}.
          </Text>

          <View style={styles.settingsCard}>
            <SettingRow
              title="Let members invite guests"
              body="When off, only you can create, re-share, or revoke guest invitations."
              value={membersCanInviteGuests}
              onValueChange={setMembersCanInviteGuests}
              disabled={!guestsEnabled}
            />
            <View style={styles.divider} />
            <SettingRow
              title="Allow plus-ones"
              body="Plus-ones count toward the same guest limit and cannot invite anyone else."
              value={allowPlusOnes}
              onValueChange={setAllowPlusOnes}
              disabled={!guestsEnabled}
            />
            <View style={styles.divider} />
            <SettingRow
              title="Show who’s going to guests"
              body="People with a valid guest invitation can see the names and profile photos of members marked Going, plus the names and inviters of outside guests marked Going. Profiles remain private and non-tappable."
              value={showAttendeeListToGuests}
              onValueChange={setShowAttendeeListToGuests}
              disabled={!guestsEnabled}
            />
          </View>

          <Pressable
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || saving) && styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>Save Guest Settings</Text>
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
  hint: {
    marginTop: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  settingsCard: {
    marginTop: 22,
    padding: 16,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
    backgroundColor: COLORS.border,
  },
  saveButton: {
    minHeight: 50,
    marginTop: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  saveText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: COLORS.bg,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
    maxWidth: 420,
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.72 },
});
