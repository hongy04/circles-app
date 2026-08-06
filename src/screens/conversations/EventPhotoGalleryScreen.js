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
import { EventAlbumMemoryCover } from '../../components/events/EventAlbumMemoryCover';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  deleteEventPhoto,
  EVENT_PHOTO_SELECTION_LIMIT,
  listEventPhotos,
  uploadEventPhotos,
} from '../../services/eventPhotoService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

const EVENT_GALLERY_FOCUS_FRESH_MS = 12_000;

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(255,255,255,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  const {
    eventId,
    conversationId,
    eventTitle = 'Event',
    appearanceKey = 'circle',
    coverUri = null,
    eventStartsAt = null,
    eventLocation = '',
  } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const cachedGallery = readNavigationCache(navigationCacheKeys.eventPhotos(eventId));
  const [gallery, setGallery] = useState(cachedGallery || {
    canUpload: false,
    photoCount: 0,
    photos: [],
  });
  const [loading, setLoading] = useState(!cachedGallery);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(Boolean(cachedGallery));
  const lastRefreshAtRef = useRef(cachedGallery ? Date.now() : 0);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState('');
  const [error, setError] = useState('');

  const syncPhotoCountToEventCaches = useCallback((photoCount, photos = []) => {
    const count = Math.max(0, Number(photoCount || 0));
    const previewPhotos = (photos || []).filter((photo) => photo?.url).slice(0, 3);
    const timelinePhotos = (photos || []).filter((photo) => photo?.url).slice(0, 6);
    const mediaPatch = {
      photoCount: count,
      ...(photos.length > 0 || count === 0 ? {
        previewUrls: previewPhotos.map((photo) => photo.url),
        previewStoragePaths: previewPhotos.map((photo) => photo.storagePath).filter(Boolean),
        timelineUrls: timelinePhotos.map((photo) => photo.url),
        timelineStoragePaths: timelinePhotos.map((photo) => photo.storagePath).filter(Boolean),
        timelineMediaSupported: true,
      } : {}),
    };
    const detailsKey = navigationCacheKeys.eventDetails(eventId);
    const cachedDetails = readNavigationCache(detailsKey);
    if (cachedDetails?.event) {
      writeNavigationCache(detailsKey, {
        ...cachedDetails,
        event: { ...cachedDetails.event, ...mediaPatch },
      });
    }

    const summaryKey = navigationCacheKeys.eventSummary(eventId);
    const cachedSummary = readNavigationCache(summaryKey);
    if (cachedSummary) {
      writeNavigationCache(summaryKey, { ...cachedSummary, ...mediaPatch });
    }

    if (conversationId) {
      const memoryKey = navigationCacheKeys.circleEventMemories(conversationId);
      const cachedMemories = readNavigationCache(memoryKey);
      if (Array.isArray(cachedMemories)) {
        writeNavigationCache(memoryKey, cachedMemories.map((event) => (
          event.id === eventId ? { ...event, ...mediaPatch } : event
        )));
      }

      const eventsKey = navigationCacheKeys.circleEvents(conversationId);
      const cachedEvents = readNavigationCache(eventsKey);
      if (Array.isArray(cachedEvents)) {
        writeNavigationCache(eventsKey, cachedEvents.map((event) => (
          event.id === eventId ? { ...event, ...mediaPatch } : event
        )));
      }
    }
  }, [conversationId, eventId]);

  const columns = width >= 720 ? 4 : 3;
  const maxContentWidth = Math.min(width, 760);
  const gap = 7;
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
      writeNavigationCache(navigationCacheKeys.eventPhotos(eventId), next);
      syncPhotoCountToEventCaches(next.photoCount, next.photos);
      lastRefreshAtRef.current = Date.now();
    } catch (loadError) {
      setError(loadError?.message || 'Could not load event photos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, syncPhotoCountToEventCaches]);

  useFocusEffect(
    useCallback(() => {
      const isFresh = hasLoadedRef.current
        && Date.now() - lastRefreshAtRef.current < EVENT_GALLERY_FOCUS_FRESH_MS;
      if (!isFresh) {
        void load({ quiet: hasLoadedRef.current }).finally(() => {
          hasLoadedRef.current = true;
        });
      }
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

      setGallery((current) => {
        const next = {
          ...current,
          photoCount: current.photoCount + uploaded.length,
          photos: [...uploaded.reverse(), ...current.photos],
        };
        writeNavigationCache(navigationCacheKeys.eventPhotos(eventId), next);
        syncPhotoCountToEventCaches(next.photoCount, next.photos);
        return next;
      });
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
              setGallery((current) => {
                const next = {
                  ...current,
                  photoCount: Math.max(0, current.photoCount - 1),
                  photos: current.photos.filter((item) => item.id !== photo.id),
                };
                writeNavigationCache(navigationCacheKeys.eventPhotos(eventId), next);
                syncPhotoCountToEventCaches(next.photoCount, next.photos);
                return next;
              });
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

  const memoryPreviewUrls = gallery.photos.slice(0, 3).map((photo) => photo.url).filter(Boolean);
  const memoryDate = eventStartsAt ? new Date(eventStartsAt) : null;
  const memoryDateLabel = memoryDate && !Number.isNaN(memoryDate.getTime())
    ? memoryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const memoryHeroHeight = Math.min(300, Math.max(236, width * 0.66));

  const header = (
    <View style={styles.headerWrap}>
      <EventAlbumMemoryCover
        appearanceKey={appearanceKey}
        coverUri={coverUri}
        previewUrls={memoryPreviewUrls}
        height={memoryHeroHeight}
      >
        <View style={styles.memoryHeroContent}>
          <View style={styles.memoryHeroTopRow}>
            <View style={styles.memoryHeroPill}>
              <Ionicons name="images-outline" size={12} color="#fff" />
              <Text style={styles.memoryHeroPillText}>EVENT ALBUM</Text>
            </View>
            <View style={styles.memoryHeroCountPill}>
              <Text style={styles.memoryHeroCountText}>
                {loading ? 'Loading…' : (gallery.photoCount === 1 ? '1 photo' : `${gallery.photoCount} photos`)}
              </Text>
            </View>
          </View>

          <View style={styles.memoryHeroCopy}>
            <Text style={styles.memoryHeroTitle} numberOfLines={2}>{eventTitle}</Text>
            <Text style={styles.memoryHeroMeta} numberOfLines={2}>
              {[memoryDateLabel, eventLocation].filter(Boolean).join(' · ') || 'Shared event memory'}
            </Text>
            <Text style={styles.memoryHeroBody}>
              The event look keeps the gathering recognizable; shared photos fill in the memory around it.
            </Text>
          </View>
        </View>
      </EventAlbumMemoryCover>

      <View style={styles.galleryTools}>
        <View style={styles.galleryActionRow}>
          <View style={styles.galleryCopy}>
            <Text style={styles.galleryTitle}>Add to the memory</Text>
            <Text style={styles.countText}>Photos stay together in this private event album.</Text>
          </View>
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
        {!loading && !gallery.canUpload ? (
          <View style={styles.uploadNotice}>
            <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.subtext} />
            <Text style={styles.uploadNoticeText}>
              The host, people marked Going, and confirmed attendees can add photos. You can still view everything shared here.
            </Text>
          </View>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={gallery.photos}
        key={columns}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        initialNumToRender={18}
        maxToRenderPerBatch={18}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={header}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            {loading ? (
              <>
                <ActivityIndicator color={theme.circle.accent} />
                <Text style={styles.emptyTitle}>Loading event photos…</Text>
              </>
            ) : (
              <>
                <Ionicons name="image-outline" size={36} color={theme.colors.subtext} />
                <Text style={styles.emptyTitle}>No event photos yet</Text>
                <Text style={styles.emptyBody}>
                  Add the first photos that belong in this memory. Invited guests can still revisit shared photos through their private link.
                </Text>
              </>
            )}
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
  headerWrap: { paddingTop: 14, paddingHorizontal: 2, paddingBottom: 8, gap: 12 },
  memoryHeroContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 16,
    justifyContent: 'space-between',
  },
  memoryHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  memoryHeroPill: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,18,38,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  memoryHeroPillText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 0.7,
  },
  memoryHeroCountPill: {
    minHeight: 30,
    maxWidth: '38%',
    paddingHorizontal: 10,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: 'rgba(11,18,38,0.36)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  memoryHeroCountText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    textAlign: 'center',
  },
  memoryHeroCopy: { maxWidth: '88%', gap: 4 },
  memoryHeroTitle: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.45,
  },
  memoryHeroMeta: {
    color: 'rgba(255,255,255,0.86)',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    lineHeight: 16,
  },
  memoryHeroBody: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.82)',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11,
    lineHeight: 16,
  },
  galleryTools: {
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: rgba(theme.colors.surface, 0.82),
  },
  galleryActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  galleryCopy: { flex: 1, minWidth: 0 },
  galleryTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 15 },
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
    borderRadius: 12,
    backgroundColor: '#e8e8e8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.58)',
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
    backgroundColor: rgba(theme.colors.surface, 0.84),
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
