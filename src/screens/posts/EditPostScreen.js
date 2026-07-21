import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import {
  fetchOwnPostForEditing,
  updateOwnPostCaption,
} from '../../services/postService';

const CAPTION_LIMIT = 2200;

export function EditPostScreen({ route, navigation }) {
  const { postId } = route.params || {};
  const [caption, setCaption] = useState('');
  const [originalCaption, setOriginalCaption] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const post = await fetchOwnPostForEditing(postId);
      if (!mountedRef.current) return;

      const nextCaption = post.caption || '';
      setCaption(nextCaption);
      setOriginalCaption(nextCaption);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError?.message || 'The post could not be loaded.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();

    return () => {
      mountedRef.current = false;
    };
  }, [postId]);

  const hasChanges = caption.trim() !== originalCaption.trim();

  const save = async () => {
    if (saving || !hasChanges) return;

    setSaving(true);
    try {
      await updateOwnPostCaption(postId, caption);
      navigation.goBack();
    } catch (saveError) {
      Alert.alert(
        'Caption not saved',
        saveError?.message || 'Please try again.'
      );
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.centerRoot}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Loading post…</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView edges={['top']} style={styles.centerRoot}>
        <Ionicons name="alert-circle-outline" size={36} color={COLORS.subtext} />
        <Text style={styles.errorTitle}>Post unavailable</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <View style={styles.errorActions}>
          <Pressable onPress={() => navigation.goBack()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Go back</Text>
          </Pressable>
          <Pressable onPress={load} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          disabled={saving}
          hitSlop={10}
          style={styles.headerButton}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>

        <Text style={styles.headerTitle}>Edit caption</Text>

        <Pressable
          onPress={save}
          disabled={saving || !hasChanges}
          hitSlop={10}
          style={styles.headerButton}
        >
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Text style={[styles.saveText, !hasChanges && styles.disabledText]}>
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Caption</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          editable={!saving}
          multiline
          autoFocus
          maxLength={CAPTION_LIMIT}
          placeholder="Write a caption…"
          placeholderTextColor={COLORS.subtext}
          style={styles.input}
        />
        <Text style={styles.counter}>{caption.length}/{CAPTION_LIMIT}</Text>
        <Text style={styles.helper}>
          Editing the caption keeps the original photos, videos, likes, and comments.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centerRoot: {
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
  errorTitle: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  errorBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  header: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerButton: {
    width: 64,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  saveText: {
    color: COLORS.primary,
    fontFamily: 'Manrope_700Bold',
  },
  disabledText: {
    opacity: 0.35,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 16,
  },
  label: {
    marginBottom: 7,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  input: {
    minHeight: 180,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    textAlignVertical: 'top',
    backgroundColor: COLORS.bg,
  },
  counter: {
    marginTop: 7,
    textAlign: 'right',
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  helper: {
    marginTop: 12,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
});
