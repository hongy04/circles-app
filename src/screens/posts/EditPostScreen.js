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
  fetchPostDetail,
  updateOwnPostCaption,
  updateOwnPostPresentation,
} from '../../services/postService';
import { PostFrameEditor } from '../../components/posts/PostFrameEditor';
import {
  presentationsByAssetId,
  serializeMediaPresentations,
} from '../../utils/postPresentation';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

const CAPTION_LIMIT = 2200;

function prepareEditablePost(detail) {
  if (!detail?.isOwner || !detail?.post) return null;
  const nextCaption = detail.post.caption || '';
  const nextAssets = (detail.media || []).map((item, index) => {
    const saved = detail.post.media_presentations?.[index] || detail.post.media_crop_points?.[index] || {};
    return {
      id: item.id,
      uri: item.url,
      type: item.media_type === 'video' ? 'video' : 'image',
      width: Number(saved.width || item.width || 0) || null,
      height: Number(saved.height || item.height || 0) || null,
    };
  });
  const rawPresentations = Array.isArray(detail.post.media_presentations) && detail.post.media_presentations.length
    ? detail.post.media_presentations
    : nextAssets.map((asset, index) => ({
        aspectRatio: detail.post.display_aspect_ratio || undefined,
        fit: detail.post.display_aspect_ratio ? 'crop' : 'full',
        ...(detail.post.media_crop_points?.[index] || {}),
      }));
  const nextPresentationById = presentationsByAssetId(nextAssets, rawPresentations);
  return {
    caption: nextCaption,
    assets: nextAssets,
    presentationById: nextPresentationById,
    serializedPresentation: JSON.stringify(serializeMediaPresentations(nextAssets, nextPresentationById)),
  };
}

export function EditPostScreen({ route, navigation }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { postId } = route.params || {};
  const cachedDetail = readNavigationCache(navigationCacheKeys.postPreview(postId));
  const initialEditor = prepareEditablePost(cachedDetail);
  const [caption, setCaption] = useState(initialEditor?.caption || '');
  const [originalCaption, setOriginalCaption] = useState(initialEditor?.caption || '');
  const [assets, setAssets] = useState(initialEditor?.assets || []);
  const [presentationById, setPresentationById] = useState(initialEditor?.presentationById || {});
  const [originalPresentation, setOriginalPresentation] = useState(initialEditor?.serializedPresentation || '');
  const [loading, setLoading] = useState(!initialEditor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  const detailRef = useRef(cachedDetail || null);

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');

    try {
      const detail = await fetchPostDetail(postId);
      const prepared = prepareEditablePost(detail);
      if (!prepared) throw new Error('This post is unavailable or you do not own it.');
      if (!mountedRef.current) return;

      detailRef.current = detail;
      writeNavigationCache(navigationCacheKeys.postPreview(postId), detail);
      setCaption(prepared.caption);
      setOriginalCaption(prepared.caption);
      setAssets(prepared.assets);
      setPresentationById(prepared.presentationById);
      setOriginalPresentation(prepared.serializedPresentation);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError?.message || 'The post could not be loaded.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    if (!initialEditor) void load();

    return () => {
      mountedRef.current = false;
    };
  }, [postId]);

  const currentPresentation = JSON.stringify(serializeMediaPresentations(assets, presentationById));
  const hasChanges = caption.trim() !== originalCaption.trim()
    || currentPresentation !== originalPresentation;

  const save = async () => {
    if (saving || !hasChanges) return;

    setSaving(true);
    try {
      const nextMediaPresentations = serializeMediaPresentations(assets, presentationById);
      await Promise.all([
        updateOwnPostCaption(postId, caption),
        updateOwnPostPresentation(postId, {
          mediaPresentations: nextMediaPresentations,
        }),
      ]);
      if (detailRef.current) {
        const nextDetail = {
          ...detailRef.current,
          post: {
            ...detailRef.current.post,
            caption,
            media_presentations: nextMediaPresentations,
          },
        };
        detailRef.current = nextDetail;
        writeNavigationCache(navigationCacheKeys.postPreview(postId), nextDetail);
      }
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

        <Text style={styles.headerTitle}>Edit post</Text>

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
          {assets.length ? (
            <PostFrameEditor
              assets={assets}
              presentationById={presentationById}
              onPresentationChange={(assetId, next) => setPresentationById((current) => ({ ...current, [assetId]: next }))}
              disabled={saving}
            />
          ) : null}

          <Text style={styles.label}>Caption</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            editable={!saving}
            multiline
            maxLength={CAPTION_LIMIT}
            placeholder="Write a caption…"
            placeholderTextColor={theme.colors.subtext}
            style={styles.input}
          />
          <Text style={styles.counter}>{caption.length}/{CAPTION_LIMIT}</Text>
          <Text style={styles.helper}>
            Each photo keeps its own framing everywhere the post appears. Original uploads, likes, and comments stay intact.
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
