import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { Avatar } from '../../components/Avatar';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  deleteEventPhoto,
  EVENT_PHOTO_SELECTION_LIMIT,
  listEventPhotos,
  uploadEventPhotos,
} from '../../services/eventPhotoService';

function formatAddedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function PhotoViewer({ photo, visible, deleting, onClose, onDelete }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!photo) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.viewerScreen}>
        <View style={styles.viewerHeader}>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.viewerIconButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>

          {photo.canDelete ? (
            <Pressable
              onPress={onDelete}
              disabled={deleting}
              hitSlop={8}
              style={({ pressed }) => [styles.viewerIconButton, pressed && styles.pressed]}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="trash-outline" size={23} color="#fff" />
              )}
            </Pressable>
          ) : (
            <View style={styles.viewerIconButton} />
          )}
        </View>

        <View style={styles.viewerImageWrap}>
          <Image
            source={{ uri: photo.url }}
            resizeMode="contain"
            style={styles.viewerImage}
          />
        </View>

        <View style={styles.viewerFooter}>
          <Avatar
            size={36}
            name={photo.uploaderName}
            uri={photo.uploaderAvatar}
          />
          <View style={styles.viewerMetaCopy}>
            <Text style={styles.viewerUploader}>{photo.uploaderName}</Text>
            {formatAddedAt(photo.createdAt) ? (
              <Text style={styles.viewerDate}>{formatAddedAt(photo.createdAt)}</Text>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function EventPhotoGalleryContent({ route }) {
  const { eventId, conversationId } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const [gallery, setGallery] = useState({
    canUpload: false,
    photoCount: 0,
    photos: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState('');
  const [error, setError] = useState('');

  const columns = width >= 720 ? 4 : 3;
  const maxContentWidth = Math.min(width, 760);
  const gap = 4;
  const tileSize = useMemo(
    () => Math.floor((maxContentWidth - 24 - gap * (columns - 1)) / columns),
    [columns, gap, maxContentWidth]
  );

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!eventId) return;
    if (!quiet) setLoading(true);
    setError('');

    try {
      const next = await listEventPhotos(eventId);
      setGallery(next);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load event photos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load({ quiet: hasLoadedRef.current }).finally(() => {
        hasLoadedRef.current = true;
      });
    }, [load])
  );

  const pickPhotos = async () => {
    if (uploading || !gallery.canUpload) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(
          'Photo permission needed',
          'Allow photo access to add memories to this event.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: EVENT_PHOTO_SELECTION_LIMIT,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) return;

      setUploading(true);
      const uploaded = await uploadEventPhotos({
        eventId,
        assets: result.assets,
        onProgress: ({ current, total }) => {
          setUploadStage(`Uploading ${current} of ${total}…`);
        },
      });

      setGallery((current) => ({
        ...current,
        photoCount: current.photoCount + uploaded.length,
        photos: [...uploaded.reverse(), ...current.photos],
      }));
      setUploadStage('');
    } catch (uploadError) {
      Alert.alert(
        'Could not add photos',
        uploadError?.message || 'Please try again.'
      );
      await load({ quiet: true });
    } finally {
      setUploading(false);
      setUploadStage('');
    }
  };

  const confirmDelete = (photo) => {
    Alert.alert(
      'Remove this event photo?',
      'It will disappear for Circle members and people viewing the guest invitation page.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (deletingPhotoId) return;
            setDeletingPhotoId(photo.id);
            try {
              await deleteEventPhoto(photo);
              setSelectedPhoto(null);
              setGallery((current) => ({
                ...current,
                photoCount: Math.max(0, current.photoCount - 1),
                photos: current.photos.filter((item) => item.id !== photo.id),
              }));
            } catch (deleteError) {
              Alert.alert(
                'Could not remove photo',
                deleteError?.message || 'Please try again.'
              );
              await load({ quiet: true });
            } finally {
              setDeletingPhotoId('');
            }
          },
        },
      ]
    );
  };

  if (loading && gallery.photos.length === 0) {
    return (
      <SafeAreaView style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening event photos…</Text>
      </SafeAreaView>
    );
  }

  const header = (
    <View style={styles.galleryTools}>
      <View style={styles.galleryActionRow}>
        <Text style={styles.countText}>
          {gallery.photoCount === 1 ? '1 photo' : `${gallery.photoCount} photos`}
        </Text>
        {gallery.canUpload ? (
          <Pressable
            onPress={pickPhotos}
            disabled={uploading}
            style={({ pressed }) => [
              styles.uploadButton,
              (pressed || uploading) && styles.pressed,
            ]}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="add" size={20} color="#fff" />
            )}
            <Text style={styles.uploadButtonText}>
              {uploading ? uploadStage || 'Uploading…' : 'Add photos'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {!gallery.canUpload ? (
        <View style={styles.uploadNotice}>
          <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.subtext} />
          <Text style={styles.uploadNoticeText}>
            The host, people marked Going, and confirmed attendees can add photos. You can still view everything shared here.
          </Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={gallery.photos}
        key={columns}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <Ionicons name="image-outline" size={36} color={theme.colors.subtext} />
            <Text style={styles.emptyTitle}>No event photos yet</Text>
            <Text style={styles.emptyBody}>
              Photos shared here become part of the gathering’s history and remain available to invited guests through their private link.
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedPhoto(item)}
            style={({ pressed }) => [
              styles.photoTile,
              { width: tileSize, height: tileSize, marginBottom: gap },
              pressed && styles.pressed,
            ]}
          >
            <Image source={{ uri: item.url }} style={styles.photoImage} />
            {item.canDelete ? (
              <View style={styles.ownerBadge}>
                <Ionicons name="ellipsis-horizontal" size={14} color="#fff" />
              </View>
            ) : null}
          </Pressable>
        )}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          load({ quiet: true });
        }}
        contentContainerStyle={styles.content}
        columnWrapperStyle={columns > 1 ? [styles.row, { gap }] : undefined}
        showsVerticalScrollIndicator={false}
      />

      <PhotoViewer
        photo={selectedPhoto}
        visible={Boolean(selectedPhoto)}
        deleting={deletingPhotoId === selectedPhoto?.id}
        onClose={() => setSelectedPhoto(null)}
        onDelete={() => confirmDelete(selectedPhoto)}
      />
    </SafeAreaView>
  );
}

export function EventPhotoGalleryScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <EventPhotoGalleryContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingBottom: 44,
  },
  row: { justifyContent: 'flex-start' },
  galleryTools: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  galleryActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  uploadButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: theme.welcome.brandInk,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
  },
  uploadButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  uploadNotice: {
    marginTop: 15,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.circle.accentSoft,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  uploadNoticeText: {
    flex: 1,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  countText: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  errorText: {
    marginTop: 8,
    color: '#b3261e',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  photoTile: {
    overflow: 'hidden',
    backgroundColor: '#e8e8e8',
  },
  photoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  ownerBadge: {
    position: 'absolute',
    right: 7,
    top: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  emptyCard: {
    marginTop: 20,
    padding: 28,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  emptyBody: {
    maxWidth: 430,
    marginTop: 5,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: theme.colors.surface,
  },
  stateText: {
    marginTop: 10,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  pressed: { opacity: 0.76 },
  viewerScreen: { flex: 1, backgroundColor: '#000' },
  viewerHeader: {
    minHeight: 58,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewerIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerFooter: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  viewerMetaCopy: { flex: 1, marginLeft: 10 },
  viewerUploader: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  viewerDate: {
    marginTop: 2,
    color: '#bbb',
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  });
}
