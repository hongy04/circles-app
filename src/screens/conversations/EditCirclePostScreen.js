import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  getCirclePost,
  updateOwnCirclePostCaption,
  updateOwnCirclePostPresentation,
} from '../../services/circlePostService';
import { PostFrameEditor } from '../../components/posts/PostFrameEditor';
import {
  presentationsByAssetId,
  serializeMediaPresentations,
} from '../../utils/postPresentation';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

const MAX_CAPTION_LENGTH = 2200;

function prepareEditablePost(row) {
  if (!row) return null;
  const framingAssets = (row.media || []).map((item, index) => {
    const saved = row.presentation?.mediaPresentations?.[index] || row.presentation?.cropPoints?.[index] || {};
    return {
      id: item.id,
      uri: item.url,
      mediaType: item.mediaType,
      width: Number(saved.width || item.width || 0) || null,
      height: Number(saved.height || item.height || 0) || null,
    };
  });
  const rawPresentations = row.presentation?.mediaPresentations?.length
    ? row.presentation.mediaPresentations
    : framingAssets.map((asset, index) => ({
        aspectRatio: row.presentation?.aspectRatio || undefined,
        fit: row.presentation?.aspectRatio ? 'crop' : 'full',
        ...(row.presentation?.cropPoints?.[index] || {}),
      }));
  const presentationById = presentationsByAssetId(framingAssets, rawPresentations);
  return {
    post: { ...row, framingAssets },
    caption: row.caption || '',
    presentationById,
    serializedPresentation: JSON.stringify(serializeMediaPresentations(framingAssets, presentationById)),
  };
}

function EditCirclePostContent({ route, navigation }) {
  const { postId } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cachedPost = readNavigationCache(navigationCacheKeys.circlePost(postId));
  const initialEditor = cachedPost?.canEdit ? prepareEditablePost(cachedPost) : null;
  const [post, setPost] = useState(initialEditor?.post || null);
  const [caption, setCaption] = useState(initialEditor?.caption || '');
  const [presentationById, setPresentationById] = useState(initialEditor?.presentationById || {});
  const [originalPresentation, setOriginalPresentation] = useState(initialEditor?.serializedPresentation || '');
  const [loading, setLoading] = useState(!initialEditor);
  const hasLoadedRef = useRef(Boolean(initialEditor));
  const skipFirstRefreshRef = useRef(Boolean(initialEditor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!postId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const row = await getCirclePost(postId);
      if (!row.canEdit) throw new Error('Only the person who created this post can edit it.');
      const prepared = prepareEditablePost(row);
      setPost(prepared.post);
      setCaption(prepared.caption);
      setPresentationById(prepared.presentationById);
      setOriginalPresentation(prepared.serializedPresentation);
      writeNavigationCache(navigationCacheKeys.circlePost(postId), row);
    } catch (loadError) {
      setError(loadError?.message || 'Could not edit this Circle post.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useFocusEffect(useCallback(() => {
    if (skipFirstRefreshRef.current) {
      skipFirstRefreshRef.current = false;
      return undefined;
    }
    void load({ quiet: hasLoadedRef.current }).finally(() => {
      hasLoadedRef.current = true;
    });
    return undefined;
  }, [load]));

  const save = async () => {
    if (!post || saving) return;
    if (caption.length > MAX_CAPTION_LENGTH) {
      Alert.alert('Caption too long', `Circle post captions can be up to ${MAX_CAPTION_LENGTH} characters.`);
      return;
    }
    setSaving(true);
    try {
      const nextMediaPresentations = serializeMediaPresentations(post.framingAssets || [], presentationById);
      await Promise.all([
        updateOwnCirclePostCaption(post.id, caption),
        updateOwnCirclePostPresentation(post.id, {
          mediaPresentations: nextMediaPresentations,
        }),
      ]);
      writeNavigationCache(navigationCacheKeys.circlePost(post.id), {
        ...post,
        caption,
        presentation: {
          ...(post.presentation || {}),
          mediaPresentations: nextMediaPresentations,
        },
      });
      navigation.goBack();
    } catch (saveError) {
      Alert.alert('Caption not saved', saveError?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.stateText}>Opening post editor…</Text>
      </SafeAreaView>
    );
  }

  if (error || !post) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <View style={styles.stateIcon}>
          <Ionicons name="alert-circle-outline" size={28} color={theme.colors.text} />
        </View>
        <Text style={styles.errorText}>{error || 'Post unavailable.'}</Text>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
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

        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={18} color={theme.colors.text} />
          <Text style={styles.noticeText}>Each attachment keeps its own frame without changing the original private uploads.</Text>
        </View>

        {post.framingAssets?.length ? (
          <PostFrameEditor
            assets={post.framingAssets}
            presentationById={presentationById}
            onPresentationChange={(assetId, next) => setPresentationById((current) => ({ ...current, [assetId]: next }))}
            disabled={saving}
          />
        ) : null}

        <View style={styles.inputCard}>
          <Text style={styles.fieldLabel}>Caption</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            editable={!saving}
            multiline
            maxLength={MAX_CAPTION_LENGTH}
            placeholder="Write a caption…"
            placeholderTextColor={theme.colors.subtext}
            style={styles.input}
          />
          <Text style={styles.count}>{caption.length}/{MAX_CAPTION_LENGTH}</Text>
        </View>

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [styles.saveButton, saving && styles.disabled, pressed && styles.pressed]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Post</Text>}
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function EditCirclePostScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <EditCirclePostContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 16, paddingBottom: 42 },
    notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: theme.circle.accentSoft },
    noticeText: { flex: 1, color: theme.colors.text, fontFamily: 'Manrope_400Regular', fontSize: 12, lineHeight: 18 },
    preview: { width: 164, height: 164, alignSelf: 'center', marginTop: 18, overflow: 'hidden', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.circle.accentSoft, backgroundColor: theme.colors.surfaceSoft },
    previewMedia: { width: '100%', height: '100%' },
    videoPreview: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' },
    countBadge: { position: 'absolute', top: 8, right: 8, minWidth: 30, height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)' },
    countText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 10 },
    inputCard: { marginTop: 20, padding: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.circle.accentSoft, borderRadius: 14, backgroundColor: theme.colors.surface },
    fieldLabel: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 12 },
    input: { minHeight: 146, marginTop: 6, padding: 0, color: theme.colors.text, fontFamily: 'Manrope_400Regular', fontSize: 15, textAlignVertical: 'top' },
    count: { alignSelf: 'flex-end', marginTop: 5, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11 },
    saveButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 12, backgroundColor: theme.welcome.brandInk },
    saveText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 15 },
    centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: theme.circle.profileBackground },
    stateIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: theme.circle.accentSoft },
    stateText: { marginTop: 10, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
    errorText: { marginTop: 12, color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72 },
  });
}
