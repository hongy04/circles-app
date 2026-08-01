import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  fetchOwnPostForEditing,
  updateOwnPostCaption,
} from '../../services/postService';

const CAPTION_LIMIT = 2200;

export function EditPostScreen({ route, navigation }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
        <Ionicons name="alert-circle-outline" size={36} color={theme.colors.subtext} />
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
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>

        <Text style={styles.headerTitle}>Edit caption</Text>

        <Pressable
          onPress={save}
          disabled={saving || !hasChanges}
          hitSlop={10}
          style={styles.headerButton}
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.circle.accent} />
          ) : (
            <Text style={[styles.saveText, !hasChanges && styles.disabledText]}>
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <Text style={styles.label}>Caption</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            editable={!saving}
            multiline
            autoFocus
            maxLength={CAPTION_LIMIT}
            placeholder="Write a caption…"
            placeholderTextColor={theme.colors.subtext}
            style={styles.input}
          />
          <Text style={styles.counter}>{caption.length}/{CAPTION_LIMIT}</Text>
          <Text style={styles.helper}>
            Editing the caption keeps the original photos, videos, likes, and comments.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: theme.colors.bg },
  centerRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: theme.colors.bg,
  },
  stateText: { marginTop: 10, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
  errorTitle: {
    marginTop: 12,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  errorBody: { marginTop: 6, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  errorActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
  },
  secondaryButtonText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold' },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.circle.accent,
  },
  primaryButtonText: { color: theme.colors.onPrimary, fontFamily: 'Manrope_700Bold' },
  header: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  headerButton: { width: 64, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  saveText: { color: theme.circle.accent, fontFamily: 'Manrope_700Bold' },
  disabledText: { opacity: 0.35 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 36 },
  label: { marginBottom: 7, color: theme.colors.text, fontFamily: 'Manrope_700Bold' },
  input: {
    minHeight: 180,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
    textAlignVertical: 'top',
    backgroundColor: theme.colors.surface,
  },
  counter: {
    marginTop: 7,
    textAlign: 'right',
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  helper: {
    marginTop: 12,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  });
}
