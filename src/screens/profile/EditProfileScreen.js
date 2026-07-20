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
  saveMyProfile,
  validateProfileInput,
} from '../../services/profileService';

const BIO_LIMIT = 160;
const NAME_LIMIT = 40;
const USERNAME_LIMIT = 24;

export function EditProfileScreen({ navigation }) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);
  const [avatarMimeType, setAvatarMimeType] = useState('image/jpeg');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const profile = await fetchMyEditableProfile();
        if (!mounted) return;

        setDisplayName(profile.display_name || '');
        setUsername(profile.username || '');
        setBio(profile.bio || '');
        setAvatarUri(profile.avatar_url || null);
      } catch (error) {
        Alert.alert(
          'Profile unavailable',
          error?.message || 'Please sign in again.'
        );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

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

  const onSave = async () => {
    if (saving) return;

    try {
      validateProfileInput({ displayName, username, bio });
    } catch (validationError) {
      Alert.alert('Check your profile', validationError.message);
      return;
    }

    setSaving(true);
    setSavePhase('Saving profile…');

    try {
      await saveMyProfile({
        displayName,
        username,
        bio,
        avatarUri,
        avatarMimeType,
        onPhaseChange: setSavePhase,
      });

      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'Could not save profile',
        error?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
      setSavePhase('');
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.centeredRoot}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.topBarSide}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>

        <Text style={styles.topBarTitle}>Edit profile</Text>

        <Pressable
          onPress={onSave}
          disabled={saving}
          hitSlop={10}
          style={[styles.topBarSide, styles.topBarSave]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Text style={styles.topBarSaveText}>Save</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.avatarSection}>
            <Pressable onPress={onPickAvatar} style={styles.avatarButton}>
              <Avatar
                size={108}
                name={displayName || 'You'}
                uri={avatarUri}
              />
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={17} color="#fff" />
              </View>
            </Pressable>

            <Pressable onPress={onPickAvatar} style={styles.changePhotoButton}>
              <Text style={styles.changePhotoText}>Change profile photo</Text>
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
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
            <View style={styles.fieldLabelRow}>
              <Text style={styles.label}>Username</Text>
              <Text style={styles.counter}>{normalizedUsername.length}/{USERNAME_LIMIT}</Text>
            </View>
            <View style={styles.usernameInputWrap}>
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
              Lowercase letters, numbers, periods, and underscores. Usernames are optional and unique.
            </Text>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.label}>Bio</Text>
              <Text style={styles.counter}>{bio.length}/{BIO_LIMIT}</Text>
            </View>
            <TextInput
              value={bio}
              onChangeText={(value) => setBio(value.slice(0, BIO_LIMIT))}
              placeholder="A little about you"
              placeholderTextColor="#9a9a9a"
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.bioInput]}
            />
          </View>

          {saving ? (
            <View style={styles.savingStatus}>
              <ActivityIndicator size="small" />
              <Text style={styles.savingStatusText}>{savePhase}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || saving) && styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save changes</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centeredRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    marginTop: 10,
  },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  topBarSide: {
    width: 54,
    height: 42,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  topBarSave: {
    alignItems: 'flex-end',
  },
  topBarSaveText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 50,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 26,
  },
  avatarButton: {
    position: 'relative',
  },
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
  changePhotoButton: {
    marginTop: 11,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  changePhotoText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  label: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  counter: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    backgroundColor: COLORS.bg,
  },
  usernameInputWrap: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    backgroundColor: COLORS.bg,
  },
  atSign: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 16,
    marginRight: 3,
  },
  usernameInput: {
    flex: 1,
    paddingVertical: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
  },
  helperText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
  },
  bioInput: {
    minHeight: 110,
  },
  savingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  savingStatusText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  saveButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  pressed: {
    opacity: 0.72,
  },
});
