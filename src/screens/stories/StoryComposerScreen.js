import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import { COLORS } from '../../theme/colors';
import { createStoryFromAsset } from '../../services/storyService';
import {
  MEDIA_LIMITS,
  formatDuration,
  formatFileSize,
  validateStoryAsset,
} from '../../utils/mediaValidation';

function normalizeStoryAsset(asset) {
  return {
    id: asset.assetId || `${asset.uri}-${Date.now()}`,
    uri: asset.uri,
    type: asset.type,
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    mimeType:
      asset.mimeType ||
      (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
  };
}

export function StoryComposerScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const [asset, setAsset] = useState(null);
  const [posting, setPosting] = useState(false);

  const previewWidth = Math.min(width - 32, 430);
  const previewHeight = Math.min(
    height * 0.58,
    previewWidth * (16 / 9)
  );

  const pickMedia = async () => {
    if (posting) return;

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Allow photo access to choose a story.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: false,
        quality: 0.9,
        videoQuality:
          ImagePicker.UIImagePickerControllerQualityType.Medium,
      });

      if (result.canceled) return;

      const nextAsset = normalizeStoryAsset(result.assets[0]);
      const validationError = validateStoryAsset(nextAsset);

      if (validationError) {
        Alert.alert('Story media not supported', validationError);
        return;
      }

      setAsset(nextAsset);
    } catch (error) {
      Alert.alert(
        'Could not open your library',
        error?.message || 'Please try again.'
      );
    }
  };

  const postStory = async () => {
    if (!asset || posting) return;

    const validationError = validateStoryAsset(asset);
    if (validationError) {
      Alert.alert('Story media not supported', validationError);
      return;
    }

    setPosting(true);

    try {
      await createStoryFromAsset(asset);
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'Story not posted',
        error?.message || 'Please try again.'
      );
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          disabled={posting}
          hitSlop={10}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={COLORS.text}
          />
        </Pressable>

        <Text style={styles.headerTitle}>New Story</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {asset ? (
          <View
            style={[
              styles.preview,
              { width: previewWidth, height: previewHeight },
            ]}
          >
            {asset.type === 'video' ? (
              <Video
                source={{ uri: asset.uri }}
                style={styles.previewMedia}
                resizeMode="cover"
                shouldPlay
                isLooping
                isMuted={false}
                useNativeControls
              />
            ) : (
              <Image
                source={{ uri: asset.uri }}
                style={styles.previewMedia}
                resizeMode="cover"
              />
            )}
          </View>
        ) : (
          <Pressable
            onPress={pickMedia}
            style={({ pressed }) => [
              styles.emptyPreview,
              { width: previewWidth, height: previewHeight },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="add-circle-outline"
              size={44}
              color={COLORS.text}
            />
            <Text style={styles.emptyTitle}>Choose a story</Text>
            <Text style={styles.emptyBody}>
              Add one photo or a short video from your library.
            </Text>
          </Pressable>
        )}

        <View style={styles.rulesRow}>
          <View style={styles.ruleChip}>
            <Ionicons
              name="time-outline"
              size={16}
              color={COLORS.subtext}
            />
            <Text style={styles.ruleText}>
              Video up to {formatDuration(MEDIA_LIMITS.storyVideoDurationMs)}
            </Text>
          </View>
          <View style={styles.ruleChip}>
            <Ionicons
              name="cloud-upload-outline"
              size={16}
              color={COLORS.subtext}
            />
            <Text style={styles.ruleText}>
              Video up to {formatFileSize(MEDIA_LIMITS.storyVideoBytes)}
            </Text>
          </View>
        </View>

        {asset ? (
          <View style={styles.assetInfo}>
            <View style={styles.assetInfoText}>
              <Text style={styles.assetName} numberOfLines={1}>
                {asset.fileName ||
                  (asset.type === 'video' ? 'Selected video' : 'Selected photo')}
              </Text>
              <Text style={styles.assetMeta}>
                {[
                  asset.type === 'video'
                    ? formatDuration(asset.duration)
                    : 'Photo',
                  formatFileSize(asset.fileSize),
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </Text>
            </View>

            <Pressable
              onPress={pickMedia}
              disabled={posting}
              style={({ pressed }) => [
                styles.changeButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.changeButtonText}>Change</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={asset ? postStory : pickMedia}
          disabled={posting}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || posting) && styles.primaryButtonPressed,
          ]}
        >
          {posting ? (
            <View style={styles.postingRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.primaryButtonText}>Posting story…</Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>
              {asset ? 'Share story' : 'Choose media'}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  headerSpacer: {
    width: 24,
  },
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 48,
  },
  preview: {
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#111',
  },
  previewMedia: {
    width: '100%',
    height: '100%',
  },
  emptyPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: '#f7f7f7',
  },
  emptyTitle: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  emptyBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  rulesRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  ruleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
  },
  ruleText: {
    marginLeft: 5,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  assetInfo: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
  assetInfoText: {
    flex: 1,
    marginRight: 12,
  },
  assetName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  assetMeta: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  changeButton: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
  },
  changeButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  primaryButton: {
    width: '100%',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  primaryButtonPressed: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  postingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  pressed: {
    opacity: 0.72,
  },
});
