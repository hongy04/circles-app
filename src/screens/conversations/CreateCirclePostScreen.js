import React, { useMemo, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  removeConversationMedia,
  uploadConversationAsset,
} from '../../services/conversationMediaService';
import { createCirclePost } from '../../services/circlePostService';
import { updateTwoPersonPlanMemoryPost } from '../../services/twoPersonPlanService';
import { PostFrameEditor } from '../../components/posts/PostFrameEditor';
import { makeDefaultMediaPresentation, serializeMediaPresentations } from '../../utils/postPresentation';

const MAX_ATTACHMENTS = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_DURATION_MS = 30 * 1000;
const MAX_CAPTION_LENGTH = 2200;

function normalizeAsset(asset) {
  return {
    id: asset.assetId || `${asset.uri}-${Date.now()}-${Math.random()}`,
    uri: asset.uri,
    mediaType: asset.type === 'video' ? 'video' : 'image',
    mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    width: asset.width || null,
    height: asset.height || null,
    durationMs: asset.duration || null,
    fileSize: asset.fileSize || null,
  };
}

function validateAssets(assets) {
  if (assets.length < 1) return 'Choose at least one photo or video.';
  if (assets.length > MAX_ATTACHMENTS) return `Choose up to ${MAX_ATTACHMENTS} photos or videos.`;
  const tooLarge = assets.find((asset) => asset.fileSize && asset.fileSize > MAX_FILE_BYTES);
  if (tooLarge) return 'Each attachment must be 25 MB or smaller.';
  const tooLong = assets.find((asset) => (
    asset.mediaType === 'video'
    && asset.durationMs
    && asset.durationMs > MAX_VIDEO_DURATION_MS
  ));
  if (tooLong) return 'Videos must be 30 seconds or shorter.';
  return null;
}

function CreateCirclePostContent({ route, navigation }) {
  const {
    conversationId,
    memoryPlanId,
    initialCaption = '',
  } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const [assets, setAssets] = useState([]);
  const [caption, setCaption] = useState(String(initialCaption || '').slice(0, MAX_CAPTION_LENGTH));
  const [presentationById, setPresentationById] = useState({});
  const [posting, setPosting] = useState(false);
  const [stage, setStage] = useState('');

  const contentWidth = Math.min(width, 720);
  const tileGap = 6;
  const tileSize = Math.floor((contentWidth - 32 - tileGap * 2) / 3);

  const pickMedia = async () => {
    if (posting) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Photo permission needed', 'Allow photo access to create a private Circle post.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: MAX_ATTACHMENTS,
        quality: 0.9,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });

      if (result.canceled) return;
      const nextAssets = (result.assets || []).map(normalizeAsset);
      const merged = [...assets, ...nextAssets].slice(0, MAX_ATTACHMENTS);
      const validationError = validateAssets(merged);
      if (validationError && merged.length > 0) {
        Alert.alert('Media not supported', validationError);
        return;
      }
      setAssets(merged);
      setPresentationById((current) => {
        const next = { ...current };
        merged.forEach((asset) => {
          if (!next[asset.id]) next[asset.id] = makeDefaultMediaPresentation(asset);
        });
        return next;
      });
    } catch (error) {
      Alert.alert('Could not open your library', error?.message || 'Please try again.');
    }
  };

  const publish = async () => {
    if (!conversationId || posting) return;
    const validationError = validateAssets(assets);
    if (validationError) {
      Alert.alert('Add media', validationError);
      return;
    }
    if (caption.length > MAX_CAPTION_LENGTH) {
      Alert.alert('Caption too long', `Circle post captions can be up to ${MAX_CAPTION_LENGTH} characters.`);
      return;
    }

    setPosting(true);
    const uploadedPaths = [];
    try {
      await Haptics.selectionAsync();
      const uploaded = [];
      for (let index = 0; index < assets.length; index += 1) {
        const asset = assets[index];
        setStage(`Uploading ${index + 1} of ${assets.length}…`);
        const result = await uploadConversationAsset({
          conversationId,
          category: 'posts',
          uri: asset.uri,
          mimeType: asset.mimeType,
        });
        uploadedPaths.push(result.storagePath);
        uploaded.push({
          storagePath: result.storagePath,
          mediaType: asset.mediaType,
          width: asset.width,
          height: asset.height,
          durationMs: asset.durationMs,
        });
      }

      setStage('Publishing privately…');
      const postId = await createCirclePost({
        conversationId,
        caption,
        mediaItems: uploaded,
        presentation: {
          mediaPresentations: serializeMediaPresentations(assets, presentationById),
        },
      });

      if (memoryPlanId) {
        try {
          await updateTwoPersonPlanMemoryPost(memoryPlanId, postId);
        } catch (linkError) {
          Alert.alert(
            'Post published',
            linkError?.message || 'The post was published, but Circles could not link it to the plan memory. You can link it manually from the memory screen.'
          );
        }
      }

      navigation.replace('CirclePostDetail', { conversationId, postId });
    } catch (error) {
      if (uploadedPaths.length) removeConversationMedia(uploadedPaths).catch(() => {});
      Alert.alert('Circle post not published', error?.message || 'Please try again.');
    } finally {
      setPosting(false);
      setStage('');
    }
  };

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

        {assets.length ? (
          <View style={[styles.mediaGrid, { gap: tileGap }]}>
            {assets.map((asset) => (
              <View key={asset.id} style={{ width: tileSize, height: tileSize }}>
                {asset.mediaType === 'image' ? (
                  <Image source={{ uri: asset.uri }} style={styles.mediaTile} />
                ) : (
                  <View style={[styles.mediaTile, styles.videoTile]}>
                    <Ionicons name="play-circle" size={38} color="#fff" />
                  </View>
                )}
                <Pressable
                  onPress={() => {
                    setAssets((current) => current.filter((item) => item.id !== asset.id));
                    setPresentationById((current) => {
                      const next = { ...current };
                      delete next[asset.id];
                      return next;
                    });
                  }}
                  disabled={posting}
                  hitSlop={7}
                  style={styles.removeButton}
                >
                  <Ionicons name="close" size={15} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Pressable onPress={pickMedia} style={({ pressed }) => [styles.mediaPicker, pressed && styles.pressed]}>
            <View style={styles.pickerIcon}>
              <Ionicons name="images-outline" size={34} color={theme.colors.text} />
            </View>
            <Text style={styles.mediaPickerTitle}>Choose photos or videos</Text>
            <Text style={styles.mediaPickerBody}>Up to 10 attachments. Only accepted Circle members can view them.</Text>
          </Pressable>
        )}

        {assets.length ? (
          <PostFrameEditor
            assets={assets}
            presentationById={presentationById}
            onPresentationChange={(assetId, next) => setPresentationById((current) => ({ ...current, [assetId]: next }))}
            disabled={posting}
          />
        ) : null}

        {assets.length ? (
          <Pressable
            onPress={pickMedia}
            disabled={posting || assets.length >= MAX_ATTACHMENTS}
            style={({ pressed }) => [
              styles.secondaryButton,
              (posting || assets.length >= MAX_ATTACHMENTS) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={18} color={theme.colors.text} />
            <Text style={styles.secondaryButtonText}>Add more ({assets.length}/{MAX_ATTACHMENTS})</Text>
          </Pressable>
        ) : null}

        <View style={styles.captionCard}>
          <Text style={styles.fieldLabel}>Caption</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            editable={!posting}
            multiline
            maxLength={MAX_CAPTION_LENGTH}
            placeholder="Write a caption…"
            placeholderTextColor={theme.colors.subtext}
            style={styles.captionInput}
          />
          <Text style={styles.characterCount}>{caption.length}/{MAX_CAPTION_LENGTH}</Text>
        </View>

        {stage ? (
          <View style={styles.stageRow}>
            <ActivityIndicator size="small" color={theme.circle.accent} />
            <Text style={styles.stageText}>{stage}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={publish}
          disabled={posting || assets.length === 0}
          style={({ pressed }) => [
            styles.publishButton,
            (posting || assets.length === 0) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishButtonText}>Post to Circle</Text>}
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function CreateCirclePostScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CreateCirclePostContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 44 },
    mediaPicker: {
      minHeight: 190,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.circle.accent,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
    },
    pickerIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: theme.circle.accentSoft },
    mediaPickerTitle: { marginTop: 14, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 16 },
    mediaPickerBody: { maxWidth: 360, marginTop: 6, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
    mediaGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    mediaTile: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: theme.colors.surfaceSoft },
    videoTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' },
    removeButton: { position: 'absolute', top: 6, right: 6, width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.72)' },
    secondaryButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.circle.accentSoft, borderRadius: 11, backgroundColor: theme.colors.surface },
    secondaryButtonText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    captionCard: { marginTop: 18, padding: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.circle.accentSoft, borderRadius: 14, backgroundColor: theme.colors.surface },
    fieldLabel: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 12 },
    captionInput: { minHeight: 116, marginTop: 6, padding: 0, color: theme.colors.text, fontFamily: 'Manrope_400Regular', fontSize: 15, textAlignVertical: 'top' },
    characterCount: { alignSelf: 'flex-end', marginTop: 5, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11 },
    stageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
    stageText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    publishButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 12, backgroundColor: theme.welcome.brandInk },
    publishButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 15 },
    disabled: { opacity: 0.42 },
    pressed: { opacity: 0.72 },
  });
}
