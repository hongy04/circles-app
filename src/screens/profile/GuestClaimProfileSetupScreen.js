import React, { useEffect, useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';

import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import {
  claimEventGuestAttendance,
  previewEventGuestInvite,
} from '../../services/eventGuestInviteService';
import {
  fetchMyEditableProfile,
  normalizeUsername,
  saveMyProfile,
  validateProfileInput,
} from '../../services/profileService';

const BIO_LIMIT = 160;
const NAME_LIMIT = 40;
const USERNAME_LIMIT = 24;

export function GuestClaimProfileSetupScreen({ route, navigation }) {
  const token = route?.params?.eventGuestToken || '';
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);
  const [avatarMimeType, setAvatarMimeType] = useState('image/jpeg');
  const [eventTitle, setEventTitle] = useState('your event');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [profile, invitation] = await Promise.all([
          fetchMyEditableProfile(),
          previewEventGuestInvite(token),
        ]);
        if (!mounted) return;

        const guestName = invitation?.guest?.displayName || '';
        const hasEstablishedIdentity = Boolean(
          profile.username || profile.avatar_url
        );

        setDisplayName(
          hasEstablishedIdentity
            ? profile.display_name || guestName
            : guestName || profile.display_name || ''
        );
        setUsername(profile.username || '');
        setBio(profile.bio || '');
        setAvatarUri(profile.avatar_url || null);
        setEventTitle(invitation?.event?.title || 'your event');
      } catch (error) {
        Alert.alert(
          'Profile setup unavailable',
          error?.message || 'Could not prepare your profile.'
        );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  const normalizedUsername = useMemo(
    () => normalizeUsername(username),
    [username]
  );

  const onPickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        'Photo access needed',
        'Allow photo access to choose a profile picture.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setAvatarUri(asset.uri);
    setAvatarMimeType(asset.mimeType || 'image/jpeg');
  };

  const openClaimedEvent = (claimResult) => {
    navigation.replace('ClaimedEventConnections', {
      eventId: claimResult.eventId,
      eventTitle: claimResult.eventTitle || eventTitle,
    });
  };

  const useAnotherAccount = async () => {
    if (saving) return;
    setSaving(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigation.replace('Auth', { eventGuestToken: token });
    } catch (error) {
      Alert.alert(
        'Could not switch accounts',
        error?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const onContinue = async () => {
    if (saving) return;

    if (!avatarUri) {
      Alert.alert(
        'Add a profile photo',
        'A photo helps people from the event recognize the person they met.'
      );
      return;
    }

    if (!normalizedUsername) {
      Alert.alert(
        'Choose a username',
        'Your Circles profile needs a unique username before entering event discovery.'
      );
      return;
    }

    try {
      validateProfileInput({ displayName, username, bio });
    } catch (validationError) {
      Alert.alert('Check your profile', validationError.message);
      return;
    }

    setSaving(true);
    try {
      await saveMyProfile({
        displayName,
        username,
        bio,
        avatarUri,
        avatarMimeType,
        onPhaseChange: setSavePhase,
      });

      setSavePhase('Linking your event…');
      const claimResult = await claimEventGuestAttendance(token);
      openClaimedEvent(claimResult);
    } catch (error) {
      Alert.alert(
        'Could not finish setup',
        error?.message || 'Your profile or event could not be linked.'
      );
    } finally {
      setSaving(false);
      setSavePhase('');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Preparing your Circles profile…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="person-circle-outline" size={36} color={COLORS.text} />
          </View>
          <Text style={styles.title}>Create your profile first</Text>
          <Text style={styles.caption}>
            People confirmed at {eventTitle} should see a recognizable Circles identity before the event opens.
          </Text>

          <View style={styles.avatarSection}>
            <Pressable onPress={onPickAvatar} style={styles.avatarButton}>
              <Avatar size={108} name={displayName || 'You'} uri={avatarUri} />
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={17} color="#fff" />
              </View>
            </Pressable>
            <Pressable onPress={onPickAvatar} style={styles.photoLink}>
              <Text style={styles.photoLinkText}>
                {avatarUri ? 'Change profile photo' : 'Add profile photo'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Display name</Text>
              <Text style={styles.counter}>{displayName.length}/{NAME_LIMIT}</Text>
            </View>
            <TextInput
              value={displayName}
              onChangeText={(value) => setDisplayName(value.slice(0, NAME_LIMIT))}
              placeholder="Your name"
              placeholderTextColor="#9a9a9a"
              autoCapitalize="words"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Username</Text>
              <Text style={styles.counter}>{normalizedUsername.length}/{USERNAME_LIMIT}</Text>
            </View>
            <View style={styles.usernameWrap}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                value={username}
                onChangeText={(value) => setUsername(value.slice(0, USERNAME_LIMIT + 1))}
                onBlur={() => setUsername(normalizedUsername)}
                placeholder="yourname"
                placeholderTextColor="#9a9a9a"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.usernameInput}
              />
            </View>
            <Text style={styles.helperText}>
              Required for a new claimed guest profile. It remains separate from your phone number.
            </Text>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Bio</Text>
              <Text style={styles.counter}>{bio.length}/{BIO_LIMIT}</Text>
            </View>
            <TextInput
              value={bio}
              onChangeText={(value) => setBio(value.slice(0, BIO_LIMIT))}
              placeholder="A little about you (optional)"
              placeholderTextColor="#9a9a9a"
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.bioInput]}
            />
          </View>

          <View style={styles.privacyCard}>
            <Ionicons name="shield-checkmark-outline" size={21} color={COLORS.text} />
            <Text style={styles.privacyText}>
              Finishing your profile links only the reviewed event. It does not join its Circles or connect you automatically.
            </Text>
          </View>

          <Pressable
            onPress={onContinue}
            disabled={saving}
            style={({ pressed }) => [
              styles.continueButton,
              (pressed || saving) && styles.pressed,
            ]}
          >
            {saving ? (
              <View style={styles.savingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.continueText}>{savePhase || 'Finishing…'}</Text>
              </View>
            ) : (
              <Text style={styles.continueText}>Save profile and open event</Text>
            )}
          </Pressable>
          <Pressable
            onPress={useAnotherAccount}
            disabled={saving}
            style={({ pressed }) => [styles.switchAccountButton, pressed && styles.pressed]}
          >
            <Text style={styles.switchAccountText}>Use another account</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },
  heroIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  title: {
    marginTop: 17,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 25,
    textAlign: 'center',
  },
  caption: {
    marginTop: 8,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  avatarSection: { alignItems: 'center', marginVertical: 25 },
  avatarButton: { position: 'relative' },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLink: { marginTop: 9, padding: 6 },
  photoLinkText: { color: COLORS.text, fontFamily: 'Manrope_700Bold' },
  fieldGroup: { marginBottom: 18 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  counter: { color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11 },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    backgroundColor: '#fafafa',
  },
  usernameWrap: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#fafafa',
    paddingHorizontal: 14,
  },
  atSign: { color: COLORS.subtext, fontFamily: 'Manrope_700Bold', fontSize: 16 },
  usernameInput: {
    flex: 1,
    marginLeft: 5,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
  },
  helperText: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  bioInput: { minHeight: 100, paddingTop: 13 },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 13,
    backgroundColor: '#f4f4f4',
  },
  privacyText: {
    flex: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 17,
  },
  continueButton: {
    minHeight: 52,
    marginTop: 18,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  switchAccountButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  switchAccountText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  continueText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.7 },
});
