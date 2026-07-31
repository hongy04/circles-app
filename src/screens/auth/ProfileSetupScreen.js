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
import {
  fetchMyEditableProfile,
  normalizeUsername,
  validateProfileInput,
} from '../../services/profileService';
import {
  checkUsernameAvailability,
  completeProfileOnboarding,
  continueAfterProfile,
} from '../../services/onboardingService';
import { authStyles } from './authStyles';

const NAME_LIMIT = 40;
const USERNAME_LIMIT = 24;
const BIO_LIMIT = 160;

function isUsernameFormatValid(username) {
  return /^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$/.test(username);
}

export function ProfileSetupScreen({ route, navigation }) {
  const inviteToken = route?.params?.inviteToken || null;
  const eventGuestToken = route?.params?.eventGuestToken || null;
  const avatarRequired = Boolean(eventGuestToken);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);
  const [avatarMimeType, setAvatarMimeType] = useState('image/jpeg');
  const [usernameStatus, setUsernameStatus] = useState('idle');

  const normalizedUsername = useMemo(
    () => normalizeUsername(username),
    [username]
  );

  useEffect(() => {
    let mounted = true;

    fetchMyEditableProfile()
      .then((profile) => {
        if (!mounted) return;
        setDisplayName(profile.display_name || '');
        setUsername(profile.username || '');
        setBio(profile.bio || '');
        setAvatarUri(profile.avatar_url || null);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!normalizedUsername) {
      setUsernameStatus('idle');
      return undefined;
    }

    if (
      normalizedUsername.length < 3
      || normalizedUsername.length > USERNAME_LIMIT
      || !isUsernameFormatValid(normalizedUsername)
    ) {
      setUsernameStatus('invalid');
      return undefined;
    }

    let active = true;
    setUsernameStatus('checking');

    const timer = setTimeout(() => {
      checkUsernameAvailability(normalizedUsername)
        .then((available) => {
          if (active) setUsernameStatus(available ? 'available' : 'taken');
        })
        .catch(() => {
          if (active) setUsernameStatus('error');
        });
    }, 450);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [normalizedUsername]);

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

  const onContinue = async () => {
    if (saving) return;

    try {
      validateProfileInput({ displayName, username, bio });
    } catch (error) {
      Alert.alert('Check your profile', error.message);
      return;
    }

    if (!normalizedUsername) {
      Alert.alert('Choose a username', 'Your username helps people recognize you after connecting.');
      return;
    }

    if (usernameStatus === 'checking') {
      Alert.alert('Still checking', 'Wait a moment while we check that username.');
      return;
    }

    if (usernameStatus !== 'available') {
      Alert.alert(
        'Choose another username',
        usernameStatus === 'taken'
          ? 'That username is already taken.'
          : 'Use 3–24 lowercase letters, numbers, periods, or underscores.'
      );
      return;
    }

    if (avatarRequired && !avatarUri) {
      Alert.alert(
        'Profile photo required',
        'Add a profile photo before linking this event attendance to your account.'
      );
      return;
    }

    setSaving(true);
    try {
      await completeProfileOnboarding({
        displayName,
        username: normalizedUsername,
        bio,
        avatarUri,
        avatarMimeType,
        onPhaseChange: setSavePhase,
      });

      await continueAfterProfile({
        navigation,
        inviteToken,
        eventGuestToken,
      });
    } catch (error) {
      Alert.alert(
        'Could not create profile',
        error?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
      setSavePhase('');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={authStyles.root} edges={['top', 'bottom']}>
        <View style={styles.loadingRoot}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Preparing your profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusMessage = (() => {
    if (!normalizedUsername) return null;
    if (usernameStatus === 'checking') return 'Checking availability…';
    if (usernameStatus === 'available') return `@${normalizedUsername} is available`;
    if (usernameStatus === 'taken') return `@${normalizedUsername} is already taken`;
    if (usernameStatus === 'invalid') return 'Use 3–24 lowercase letters, numbers, periods, or underscores.';
    if (usernameStatus === 'error') return 'Could not check right now. Try editing the username.';
    return null;
  })();

  const usernameReady = usernameStatus === 'available';

  return (
    <SafeAreaView style={authStyles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={authStyles.scrollContent}
        >
          <View style={styles.progressRow}>
            <View style={[styles.progressSegment, styles.progressSegmentActive]} />
            <View style={styles.progressSegment} />
          </View>

          <Text style={authStyles.stepText}>Step 1 of 2</Text>
          <Text style={authStyles.title}>Make your profile yours.</Text>
          <Text style={authStyles.caption}>
            Your full profile remains private until you accept a connection.
          </Text>

          <View style={styles.avatarSection}>
            <Pressable onPress={onPickAvatar} style={styles.avatarPressable}>
              <Avatar size={104} name={displayName || 'You'} uri={avatarUri} />
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={17} color="#fff" />
              </View>
            </Pressable>
            <Pressable onPress={onPickAvatar} style={styles.photoTextButton}>
              <Text style={styles.photoText}>
                {avatarUri ? 'Change profile photo' : avatarRequired ? 'Add profile photo' : 'Add a photo (optional)'}
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
              autoComplete="name"
              style={authStyles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Username</Text>
              <Text style={styles.counter}>{normalizedUsername.length}/{USERNAME_LIMIT}</Text>
            </View>
            <View style={[
              styles.usernameField,
              usernameStatus === 'taken' || usernameStatus === 'invalid'
                ? authStyles.inputError
                : null,
            ]}>
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
              {usernameStatus === 'checking' ? (
                <ActivityIndicator size="small" />
              ) : usernameReady ? (
                <Ionicons name="checkmark-circle" size={20} color="#147a44" />
              ) : null}
            </View>
            {statusMessage ? (
              <Text
                style={usernameReady ? authStyles.successText : usernameStatus === 'checking' ? authStyles.helperText : authStyles.errorText}
              >
                {statusMessage}
              </Text>
            ) : (
              <Text style={authStyles.helperText}>
                Usernames are unique and can be changed later.
              </Text>
            )}
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
              style={[authStyles.input, styles.bioInput]}
            />
          </View>

          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" />
              <Text style={styles.savingText}>{savePhase || 'Creating your profile…'}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onContinue}
            disabled={saving || !displayName.trim() || !usernameReady}
            style={({ pressed }) => [
              authStyles.primaryButton,
              (saving || !displayName.trim() || !usernameReady) && authStyles.primaryButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={authStyles.primaryButtonText}>Continue</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e7e7e7',
  },
  progressSegmentActive: {
    backgroundColor: COLORS.text,
  },
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    marginTop: 10,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 24,
  },
  avatarPressable: {
    position: 'relative',
  },
  cameraBadge: {
    position: 'absolute',
    right: 1,
    bottom: 3,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTextButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 4,
  },
  photoText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  counter: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  usernameField: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 15,
  },
  atSign: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    marginRight: 3,
  },
  usernameInput: {
    flex: 1,
    minHeight: 52,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 16,
  },
  bioInput: {
    minHeight: 96,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  savingText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  pressed: {
    opacity: 0.68,
  },
});
