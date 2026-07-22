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
import { COLORS } from '../../theme/colors';
import {
  getCirclePost,
  updateOwnCirclePostCaption,
} from '../../services/circlePostService';

const MAX_CAPTION_LENGTH = 2200;

export function EditCirclePostScreen({ route, navigation }) {
  const { postId } = route.params || {};
  const [post, setPost] = useState(null);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError('');

    try {
      const row = await getCirclePost(postId);
      if (!row.canEdit) {
        throw new Error('Only the person who created this post can edit it.');
      }
      setPost(row);
      setCaption(row.caption || '');
    } catch (loadError) {
      setError(loadError?.message || 'Could not edit this Circle post.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (!post || saving) return;
    if (caption.length > MAX_CAPTION_LENGTH) {
      Alert.alert(
        'Caption too long',
        `Circle post captions can be up to ${MAX_CAPTION_LENGTH} characters.`
      );
      return;
    }

    setSaving(true);
    try {
      await updateOwnCirclePostCaption(post.id, caption);
      navigation.goBack();
    } catch (saveError) {
      Alert.alert(
        'Caption not saved',
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
        <Text style={styles.stateText}>Opening post editor…</Text>
      </SafeAreaView>
    );
  }

  if (error || !post) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={36} color={COLORS.text} />
        <Text style={styles.errorText}>{error || 'Post unavailable.'}</Text>
      </SafeAreaView>
    );
  }

  const firstMedia = post.media[0];

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.text} />
          <Text style={styles.noticeText}>
            You can update the caption. Media stays fixed so the post keeps its original context.
          </Text>
        </View>

        {firstMedia ? (
          <View style={styles.preview}>
            {firstMedia.mediaType === 'image' ? (
              <Image
                source={{ uri: firstMedia.url }}
                style={styles.previewMedia}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.previewMedia, styles.videoPreview]}>
                <Ionicons name="play-circle" size={48} color="#fff" />
              </View>
            )}
            {post.media.length > 1 ? (
              <View style={styles.countBadge}>
                <Ionicons name="copy-outline" size={13} color="#fff" />
                <Text style={styles.countText}>{post.media.length}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <TextInput
          value={caption}
          onChangeText={setCaption}
          editable={!saving}
          multiline
          maxLength={MAX_CAPTION_LENGTH}
          placeholder="Write a caption…"
          placeholderTextColor="#999"
          style={styles.input}
        />
        <Text style={styles.count}>{caption.length}/{MAX_CAPTION_LENGTH}</Text>

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveButton,
            saving && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save Caption</Text>
          )}
        </Pressable>
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
    maxWidth: 620,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 42,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f4f4f4',
  },
  noticeText: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  preview: {
    width: 150,
    height: 150,
    alignSelf: 'center',
    marginTop: 18,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#ececec',
  },
  previewMedia: {
    width: '100%',
    height: '100%',
  },
  videoPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1c1e',
  },
  countBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 30,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  countText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  input: {
    minHeight: 150,
    marginTop: 20,
    padding: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
    textAlignVertical: 'top',
  },
  count: {
    alignSelf: 'flex-end',
    marginTop: 5,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  saveButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    borderRadius: 12,
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
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
});
