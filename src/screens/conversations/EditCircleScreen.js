import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import {
  getConversationDetails,
  updateGroupCircleProfile,
} from '../../services/conversationService';
import {
  removeConversationMedia,
  uploadConversationAsset,
} from '../../services/conversationMediaService';

export function EditCircleScreen({ route, navigation }) {
  const { conversationId } = route.params || {};
  const [details, setDetails] = useState(null);
  const [title, setTitle] = useState('');
  const [bio, setBio] = useState('');
  const [avatarAsset, setAvatarAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) return;

    try {
      const result = await getConversationDetails(conversationId);
      if (result?.conversation?.kind !== 'group') {
        throw new Error('Only group Circles have editable shared identity.');
      }

      setDetails(result);
      setTitle(result.conversation.title || '');
      setBio(result.conversation.bio || '');
    } catch (error) {
      Alert.alert('Circle unavailable', error?.message || 'Please try again.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [conversationId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.status !== 'granted') {
      Alert.alert(
        'Photo permission needed',
        'Allow photo access to choose a Circle profile picture.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setAvatarAsset({
      uri: asset.uri,
      mimeType: asset.mimeType || 'image/jpeg',
    });
  };

  const save = async () => {
    const cleanTitle = title.trim();
    const cleanBio = bio.trim();

    if (!cleanTitle) {
      Alert.alert('Circle name required', 'Enter a name for this Circle.');
      return;
    }

    if (cleanTitle.length > 60) {
      Alert.alert('Circle name too long', 'Use 60 characters or fewer.');
      return;
    }

    if (cleanBio.length > 160) {
      Alert.alert('Bio too long', 'Use 160 characters or fewer.');
      return;
    }

    setSaving(true);
    let uploadedPath = null;

    try {
      if (avatarAsset) {
        const upload = await uploadConversationAsset({
          conversationId,
          category: 'avatars',
          uri: avatarAsset.uri,
          mimeType: avatarAsset.mimeType,
        });
        uploadedPath = upload.storagePath;
      }

      await updateGroupCircleProfile({
        conversationId,
        title: cleanTitle,
        bio: cleanBio,
        avatarPath: uploadedPath,
      });

      navigation.goBack();
    } catch (error) {
      if (uploadedPath) {
        removeConversationMedia([uploadedPath]).catch(() => {});
      }

      Alert.alert(
        'Circle not updated',
        error?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const conversation = details?.conversation;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={pickAvatar}
          disabled={saving}
          style={({ pressed }) => [
            styles.avatarButton,
            pressed && styles.pressed,
          ]}
        >
          {avatarAsset ? (
            <Image source={{ uri: avatarAsset.uri }} style={styles.avatarImage} />
          ) : (
            <Avatar
              size={104}
              name={conversation?.title || 'Circle'}
              uri={conversation?.avatar_url}
            />
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={17} color="#fff" />
          </View>
        </Pressable>

        <Text style={styles.changePhoto}>Change Circle photo</Text>
        <Text style={styles.helper}>
          Any accepted member can update this shared group identity.
        </Text>

        <Text style={styles.label}>CIRCLE NAME</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={60}
          editable={!saving}
          placeholder="Circle name"
          style={styles.input}
        />
        <Text style={styles.counter}>{title.length}/60</Text>

        <Text style={styles.label}>CIRCLE BIO</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          maxLength={160}
          editable={!saving}
          placeholder="What is this Circle about?"
          multiline
          style={[styles.input, styles.bioInput]}
        />
        <Text style={styles.counter}>{bio.length}/160</Text>

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
            <Text style={styles.saveText}>Save Circle Profile</Text>
          )}
        </Pressable>

        <View style={styles.privacyNote}>
          <Ionicons name="lock-closed-outline" size={20} color={COLORS.text} />
          <Text style={styles.privacyText}>
            The Circle photo is stored privately and is only available to
            accepted members.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 48,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  avatarButton: {
    width: 112,
    height: 112,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  cameraBadge: {
    position: 'absolute',
    right: 1,
    bottom: 5,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    borderWidth: 3,
    borderColor: COLORS.bg,
    backgroundColor: COLORS.primary,
  },
  changePhoto: {
    marginTop: 8,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    textAlign: 'center',
  },
  helper: {
    maxWidth: 360,
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 28,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  label: {
    marginTop: 16,
    marginBottom: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    color: COLORS.text,
    backgroundColor: '#f8f8f8',
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
  },
  bioInput: {
    minHeight: 112,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  counter: {
    marginTop: 5,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    textAlign: 'right',
  },
  saveButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  saveText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  privacyNote: {
    flexDirection: 'row',
    marginTop: 18,
    padding: 14,
    borderRadius: 13,
    backgroundColor: '#f1f1f1',
  },
  privacyText: {
    flex: 1,
    marginLeft: 10,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
});
