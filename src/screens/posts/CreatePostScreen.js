import React, { useMemo, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../theme/colors';
import { createPostWithMedia } from '../../services/postService';
import {
  formatDuration,
  formatFileSize,
  validatePostAssets,
} from '../../utils/mediaValidation';

function normalizeAsset(asset) {
  return {
    id:
      asset.assetId ||
      `${asset.uri}-${Date.now()}-${Math.random()}`,
    uri: asset.uri,
    type: asset.type,
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    mimeType:
      asset.mimeType ||
      (asset.type === 'video'
        ? 'video/mp4'
        : 'image/jpeg'),
  };
}

function progressLabel(progress) {
  if (!progress) return 'Post';

  if (progress.stage === 'saving') {
    return 'Finishing post…';
  }

  return `Uploading ${progress.current} of ${progress.total}…`;
}

export function CreatePostScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const [assets, setAssets] = useState([]);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState(null);

  const thumbnailSize = useMemo(
    () =>
      Math.max(
        64,
        (Math.min(width, 720) - 32 - 18) / 4
      ),
    [width]
  );

  const pickMedia = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Allow photo access to choose media for your post.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.9,
        videoQuality:
          ImagePicker.UIImagePickerControllerQualityType.High,
      });

      if (result.canceled) return;

      const nextAssets = result.assets.map(normalizeAsset);
      const validationError = validatePostAssets(nextAssets);

      if (validationError) {
        Alert.alert('Media not added', validationError);
        return;
      }

      setAssets(nextAssets);
    } catch (error) {
      Alert.alert(
        'Could not open your library',
        error?.message || 'Please try again.'
      );
    }
  };

  const removeAsset = (assetId) => {
    if (posting) return;
    setAssets((current) =>
      current.filter((asset) => asset.id !== assetId)
    );
  };

  const submit = async () => {
    if (!assets.length) {
      Alert.alert(
        'Add media',
        'Select at least one photo or video.'
      );
      return;
    }

    if (posting) return;

    setPosting(true);
    setProgress({
      stage: 'uploading',
      current: 1,
      total: assets.length,
    });

    try {
      await createPostWithMedia({
        assets,
        caption,
        onProgress: setProgress,
      });

      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'Post not created',
        error?.message || 'Please try again.'
      );
    } finally {
      setPosting(false);
      setProgress(null);
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

        <Text style={styles.headerTitle}>New Post</Text>

        <Pressable
          onPress={submit}
          disabled={posting || !assets.length}
          hitSlop={10}
        >
          <Text
            style={[
              styles.headerAction,
              (posting || !assets.length) &&
                styles.headerActionDisabled,
            ]}
          >
            Post
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={pickMedia}
          disabled={posting}
          style={({ pressed }) => [
            styles.picker,
            pressed && styles.pickerPressed,
          ]}
        >
          <Ionicons
            name="images-outline"
            size={30}
            color={COLORS.text}
          />
          <Text style={styles.pickerTitle}>
            {assets.length
              ? 'Choose different media'
              : 'Choose photos or videos'}
          </Text>
          <Text style={styles.pickerCaption}>
            Select up to 10 items
          </Text>
        </Pressable>

        {assets.length ? (
          <View style={styles.selectionSection}>
            <View style={styles.selectionHeader}>
              <Text style={styles.selectionTitle}>
                Selected media
              </Text>
              <Text style={styles.selectionCount}>
                {assets.length}/10
              </Text>
            </View>

            <View style={styles.thumbnailGrid}>
              {assets.map((asset, index) => (
                <View
                  key={asset.id}
                  style={[
                    styles.thumbnailWrap,
                    {
                      width: thumbnailSize,
                      height: thumbnailSize,
                    },
                  ]}
                >
                  {asset.type === 'video' ? (
                    <View style={styles.videoThumbnail}>
                      <Ionicons
                        name="play-circle"
                        size={34}
                        color="#fff"
                      />
                      <Text style={styles.videoLabel}>
                        {formatDuration(asset.duration) || 'Video'}
                      </Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: asset.uri }}
                      style={styles.thumbnail}
                    />
                  )}

                  {asset.fileSize ? (
                    <View style={styles.fileBadge}>
                      <Text style={styles.fileBadgeText}>
                        {formatFileSize(asset.fileSize)}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.orderBadge}>
                    <Text style={styles.orderText}>{index + 1}</Text>
                  </View>

                  <Pressable
                    onPress={() => removeAsset(asset.id)}
                    disabled={posting}
                    hitSlop={6}
                    style={styles.removeButton}
                  >
                    <Ionicons name="close" size={15} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>Caption</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          editable={!posting}
          placeholder="Write a caption…"
          placeholderTextColor="#8d8d8d"
          multiline
          maxLength={2200}
          style={styles.captionInput}
        />
        <Text style={styles.characterCount}>
          {caption.length}/2200
        </Text>

        <Pressable
          onPress={submit}
          disabled={posting || !assets.length}
          style={({ pressed }) => [
            styles.postButton,
            (pressed || posting || !assets.length) &&
              styles.postButtonDisabled,
          ]}
        >
          {posting ? (
            <View style={styles.progressRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.progressText}>
                {progressLabel(progress)}
              </Text>
            </View>
          ) : (
            <Text style={styles.postButtonText}>Share post</Text>
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
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
    color: COLORS.text,
  },
  headerAction: {
    fontFamily: 'Manrope_700Bold',
    color: COLORS.primary,
  },
  headerActionDisabled: {
    opacity: 0.35,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 50,
  },
  picker: {
    alignItems: 'center',
    padding: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  pickerPressed: {
    opacity: 0.72,
  },
  pickerTitle: {
    marginTop: 9,
    fontFamily: 'Manrope_700Bold',
    color: COLORS.text,
  },
  pickerCaption: {
    marginTop: 3,
    fontFamily: 'Manrope_400Regular',
    color: COLORS.subtext,
    fontSize: 12,
  },
  selectionSection: {
    marginTop: 18,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  selectionTitle: {
    fontFamily: 'Manrope_700Bold',
    color: COLORS.text,
  },
  selectionCount: {
    fontFamily: 'Manrope_400Regular',
    color: COLORS.subtext,
  },
  thumbnailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  thumbnailWrap: {
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: '#e7e7e7',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoThumbnail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#242424',
  },
  videoLabel: {
    marginTop: 3,
    fontFamily: 'Manrope_600SemiBold',
    color: '#fff',
    fontSize: 11,
  },
  fileBadge: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  fileBadgeText: {
    color: '#fff',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 9,
  },
  orderBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  orderText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  fieldLabel: {
    marginTop: 20,
    marginBottom: 7,
    fontFamily: 'Manrope_700Bold',
    color: COLORS.text,
  },
  captionInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
    fontFamily: 'Manrope_400Regular',
    color: COLORS.text,
  },
  characterCount: {
    marginTop: 5,
    alignSelf: 'flex-end',
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  postButton: {
    marginTop: 18,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  postButtonDisabled: {
    opacity: 0.55,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  postButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  progressText: {
    marginLeft: 8,
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
});
