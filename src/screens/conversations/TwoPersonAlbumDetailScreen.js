import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { Avatar } from '../../components/Avatar';
import { AlbumMemoryCover } from '../../components/circles/AlbumMemoryCover';
import { CircleBackdrop } from '../../components/circles/CircleBackdrop';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  deleteTwoPersonAlbum,
  deleteTwoPersonAlbumPhoto,
  getTwoPersonAlbum,
  setTwoPersonAlbumCover,
  subscribeToTwoPersonAlbumChanges,
  TWO_PERSON_ALBUM_SELECTION_LIMIT,
  uploadTwoPersonAlbumPhotos,
} from '../../services/twoPersonAlbumService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(77,185,229,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAddedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function PhotoViewer({ photo, visible, deleting, onClose, onDelete, styles }) {
  if (!photo) return null;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.viewerScreen}>
        <View style={styles.viewerHeader}>
          <Pressable onPress={onClose} style={styles.viewerIconButton}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {photo.canDelete ? (
            <Pressable onPress={onDelete} disabled={deleting} style={styles.viewerIconButton}>
              {deleting ? <ActivityIndicator color="#fff" /> : (
                <Ionicons name="trash-outline" size={23} color="#fff" />
              )}
            </Pressable>
          ) : <View style={styles.viewerIconButton} />}
        </View>
        <View style={styles.viewerImageWrap}>
          <Image source={{ uri: photo.url }} resizeMode="contain" style={styles.viewerImage} />
        </View>
        <View style={styles.viewerFooter}>
          <Avatar size={36} name={photo.uploaderName} uri={photo.uploaderAvatar} />
          <View style={styles.viewerMetaCopy}>
            <Text style={styles.viewerUploader}>{photo.uploaderName}</Text>
            <Text style={styles.viewerDate}>{formatAddedAt(photo.createdAt)}</Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function CoverPicker({
  visible,
  album,
  busyPhotoId,
  onClose,
  onChoose,
  styles,
  theme,
}) {
  if (!album) return null;
  const photos = album.photos || [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.coverPickerScreen}>
        <View style={styles.coverPickerHeader}>
          <View style={styles.coverPickerHeading}>
            <Text style={styles.coverPickerEyebrow}>SCRAPBOOK COVER</Text>
            <Text style={styles.coverPickerTitle}>Choose what you remember first</Text>
          </View>
          <Pressable onPress={onClose} style={styles.coverPickerClose}>
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </Pressable>
        </View>
        <Text style={styles.coverPickerIntro}>
          Pick one photo as the album cover, or let Circles keep making an automatic collage from the album.
        </Text>

        <ScrollView contentContainerStyle={styles.coverPickerContent}>
          <Pressable
            onPress={() => onChoose(null)}
            disabled={Boolean(busyPhotoId)}
            style={({ pressed }) => [
              styles.autoCoverCard,
              !album.coverPhotoId && styles.autoCoverCardSelected,
              pressed && styles.pressed,
            ]}
          >
            <AlbumMemoryCover
              coverUrl={null}
              previewUrls={album.previewUrls}
              height={128}
              borderRadius={18}
            />
            <View style={styles.autoCoverCopy}>
              <View style={styles.autoCoverTitleRow}>
                <Ionicons name="albums-outline" size={18} color={theme.colors.text} />
                <Text style={styles.autoCoverTitle}>Automatic collage</Text>
              </View>
              <Text style={styles.autoCoverText}>Changes naturally as the album grows.</Text>
            </View>
            {!album.coverPhotoId ? (
              <View style={styles.selectedCheck}>
                <Ionicons name="checkmark" size={16} color="#fff" />
              </View>
            ) : null}
          </Pressable>

          {photos.length ? (
            <View style={styles.coverPhotoGrid}>
              {photos.map((photo) => {
                const selected = album.coverPhotoId === photo.id;
                const busy = busyPhotoId === photo.id;
                return (
                  <Pressable
                    key={photo.id}
                    onPress={() => onChoose(photo.id)}
                    disabled={Boolean(busyPhotoId)}
                    style={({ pressed }) => [styles.coverPhotoChoice, pressed && styles.pressed]}
                  >
                    <Image source={{ uri: photo.url }} style={styles.coverPhotoChoiceImage} />
                    {selected || busy ? (
                      <View style={[styles.coverChoiceBadge, selected && styles.coverChoiceBadgeSelected]}>
                        {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                          <Ionicons name="checkmark" size={16} color="#fff" />
                        )}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.coverPickerEmpty}>
              <Ionicons name="images-outline" size={32} color={theme.circle.accent} />
              <Text style={styles.coverPickerEmptyText}>Add photos first, then you can choose a cover.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function TwoPersonAlbumDetailContent({ route, navigation }) {
  const { albumId, conversationId, circleName = 'Our Circle' } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const cachedAlbum = readNavigationCache(navigationCacheKeys.album(albumId));
  const cachedHasFullPhotos = Array.isArray(cachedAlbum?.photos);
  const [album, setAlbum] = useState(() => cachedAlbum
    ? { ...cachedAlbum, photos: cachedHasFullPhotos ? cachedAlbum.photos : [] }
    : null);
  const [loading, setLoading] = useState(!cachedAlbum);
  const [photosHydrating, setPhotosHydrating] = useState(Boolean(cachedAlbum && !cachedHasFullPhotos));
  const hasLoadedRef = useRef(Boolean(cachedAlbum));
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState('');
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [coverBusyPhotoId, setCoverBusyPhotoId] = useState('');
  const [error, setError] = useState('');

  const columns = width >= 720 ? 4 : 3;
  const maxContentWidth = Math.min(width, 760);
  const gap = 4;
  const tileSize = useMemo(
    () => Math.floor((maxContentWidth - 24 - gap * (columns - 1)) / columns),
    [columns, gap, maxContentWidth]
  );

  const commitAlbum = useCallback((nextAlbum) => {
    setAlbum(nextAlbum);
    writeNavigationCache(navigationCacheKeys.album(albumId), nextAlbum);
  }, [albumId]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!albumId) return;
    if (!quiet) setLoading(true);
    if (quiet) setPhotosHydrating(true);
    setError('');
    try {
      const nextAlbum = await getTwoPersonAlbum(albumId);
      commitAlbum(nextAlbum);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this shared album.');
    } finally {
      setLoading(false);
      setPhotosHydrating(false);
    }
  }, [albumId, commitAlbum]);

  useFocusEffect(useCallback(() => {
    void load({ quiet: hasLoadedRef.current }).finally(() => {
      hasLoadedRef.current = true;
    });
  }, [load]));

  useFocusEffect(useCallback(() => {
    return subscribeToTwoPersonAlbumChanges({
      conversationId,
      onChange: () => load({ quiet: true }),
    });
  }, [conversationId, load]));

  const pickPhotos = async () => {
    if (uploading) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Photo permission needed', 'Allow photo access to add photos to this shared album.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: TWO_PERSON_ALBUM_SELECTION_LIMIT,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;

      setUploading(true);
      const uploaded = await uploadTwoPersonAlbumPhotos({
        albumId,
        assets: result.assets,
        onProgress: ({ current, total }) => setUploadStage(`Uploading ${current} of ${total}…`),
      });
      setAlbum((current) => {
        if (!current) return current;
        const nextPhotos = [...uploaded.slice().reverse(), ...(current.photos || [])];
        const nextPreviews = Array.from(new Set([
          ...(current.previewUrls || []),
          ...uploaded.map((photo) => photo.url).filter(Boolean),
        ])).slice(0, 3);
        const next = {
          ...current,
          photoCount: current.photoCount + uploaded.length,
          photos: nextPhotos,
          previewUrls: nextPreviews,
        };
        writeNavigationCache(navigationCacheKeys.album(albumId), next);
        return next;
      });
    } catch (uploadError) {
      Alert.alert('Could not add photos', uploadError?.message || 'Please try again.');
      load({ quiet: true });
    } finally {
      setUploading(false);
      setUploadStage('');
    }
  };

  const chooseCover = async (photoId) => {
    if (!album || coverBusyPhotoId) return;
    const busyKey = photoId || 'automatic';
    setCoverBusyPhotoId(busyKey);
    try {
      const updated = await setTwoPersonAlbumCover({ albumId, photoId });
      const next = {
        ...album,
        ...updated,
        photos: album.photos || [],
      };
      commitAlbum(next);
      setCoverPickerOpen(false);
    } catch (coverError) {
      Alert.alert('Could not change cover', coverError?.message || 'Please try again.');
    } finally {
      setCoverBusyPhotoId('');
    }
  };

  const removePhoto = (photo) => {
    Alert.alert(
      'Remove this photo?',
      album?.coverPhotoId === photo.id
        ? 'It is also the current album cover. Circles will return to the automatic collage after it is removed.'
        : 'It will disappear from this shared album for both people.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeletingPhotoId(photo.id);
            try {
              await deleteTwoPersonAlbumPhoto(photo);
              setSelectedPhoto(null);
              await load({ quiet: true });
            } catch (deleteError) {
              Alert.alert('Could not remove photo', deleteError?.message || 'Please try again.');
            } finally {
              setDeletingPhotoId('');
            }
          },
        },
      ]
    );
  };

  const removeAlbum = () => {
    if (!album) return;
    Alert.alert(
      'Delete this shared album?',
      'The album and its photos will be removed for both people. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Album',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTwoPersonAlbum(album);
              navigation.goBack();
            } catch (deleteError) {
              Alert.alert('Could not delete album', deleteError?.message || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  if (loading && !album) {
    return (
      <SafeAreaView style={styles.centerState}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.stateText}>Opening album…</Text>
      </SafeAreaView>
    );
  }

  if (error && !album) {
    return (
      <SafeAreaView style={styles.centerState}>
        <Ionicons name="lock-closed-outline" size={36} color={theme.circle.accent} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const header = album ? (
    <View style={styles.header}>
      <AlbumMemoryCover
        coverUrl={album.coverUrl}
        previewUrls={album.previewUrls}
        height={Math.min(282, Math.max(224, width * 0.63))}
        borderRadius={26}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroTypePill}>
            <Ionicons name="images-outline" size={12} color="#fff" />
            <Text style={styles.heroTypeText}>SHARED MEMORY</Text>
          </View>
          <View style={styles.heroActions}>
            <Pressable
              onPress={() => setCoverPickerOpen(true)}
              disabled={!album.photos?.length}
              style={({ pressed }) => [
                styles.heroIconButton,
                !album.photos?.length && styles.heroIconButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="albums-outline" size={18} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('TwoPersonAlbumEditor', {
                albumId,
                conversationId,
                circleName,
              })}
              style={({ pressed }) => [styles.heroIconButton, pressed && styles.pressed]}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{album.title}</Text>
          <Text style={styles.heroMeta}>
            {album.photoCount} photo{album.photoCount === 1 ? '' : 's'}
            {album.occurredOn ? ` · ${formatDate(album.occurredOn)}` : ''}
          </Text>
        </View>
      </AlbumMemoryCover>

      <View style={styles.memoryControls}>
        {album.note ? (
          <View style={styles.noteCard}>
            <View style={styles.noteIcon}>
              <Ionicons name="heart-outline" size={17} color={theme.colors.text} />
            </View>
            <Text style={styles.note}>{album.note}</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={pickPhotos}
            disabled={uploading}
            style={({ pressed }) => [styles.addButton, (pressed || uploading) && styles.pressed]}
          >
            {uploading ? <ActivityIndicator color="#fff" /> : <Ionicons name="images-outline" size={18} color="#fff" />}
            <Text style={styles.addButtonText}>{uploadStage || 'Add Photos'}</Text>
          </Pressable>
          <Pressable
            onPress={() => setCoverPickerOpen(true)}
            disabled={!album.photos?.length}
            style={({ pressed }) => [
              styles.secondaryButton,
              !album.photos?.length && styles.secondaryButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="albums-outline" size={17} color={theme.colors.text} />
            <Text style={styles.secondaryButtonText}>{album.coverPhotoId ? 'Change Cover' : 'Choose Cover'}</Text>
          </Pressable>
          <Pressable
            onPress={removeAlbum}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={18} color="#c62828" />
          </Pressable>
        </View>
        {!album.coverPhotoId && album.photoCount > 0 ? (
          <Text style={styles.autoCoverHint}>Circles is making this cover automatically from the album.</Text>
        ) : null}
      </View>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.screen}>
      <CircleBackdrop conversationId={conversationId} imageTintOpacity={0.08} />
      <FlatList
        data={album?.photos || []}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedPhoto(item)}
            style={({ pressed }) => [
              styles.tile,
              { width: tileSize, height: tileSize },
              album?.coverPhotoId === item.id && styles.coverTile,
              pressed && styles.pressed,
            ]}
          >
            <Image source={{ uri: item.url }} style={styles.tileImage} />
            {album?.coverPhotoId === item.id ? (
              <View style={styles.coverTileBadge}>
                <Ionicons name="sparkles" size={11} color="#fff" />
                <Text style={styles.coverTileBadgeText}>COVER</Text>
              </View>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={photosHydrating ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={theme.circle.accent} />
            <Text style={styles.stateText}>Loading photos…</Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="images-outline" size={42} color={theme.circle.accent} />
            <Text style={styles.emptyTitle}>No photos yet</Text>
            <Text style={styles.stateText}>Add the first photos that belong in this memory.</Text>
          </View>
        )}
      />
      <PhotoViewer
        photo={selectedPhoto}
        visible={Boolean(selectedPhoto)}
        deleting={deletingPhotoId === selectedPhoto?.id}
        onClose={() => setSelectedPhoto(null)}
        onDelete={() => removePhoto(selectedPhoto)}
        styles={styles}
      />
      <CoverPicker
        visible={coverPickerOpen}
        album={album}
        busyPhotoId={coverBusyPhotoId}
        onClose={() => !coverBusyPhotoId && setCoverPickerOpen(false)}
        onChoose={chooseCover}
        styles={styles}
        theme={theme}
      />
    </SafeAreaView>
  );
}

export function TwoPersonAlbumDetailScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <TwoPersonAlbumDetailContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  const glass = rgba(theme.colors.surface, 0.78);
  const glassStrong = rgba(theme.colors.surface, 0.91);
  const accentBorder = rgba(theme.circle.accent, 0.22);

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    content: { paddingHorizontal: 12, paddingBottom: 52, flexGrow: 1 },
    header: { marginTop: 12, marginBottom: 14 },
    heroTopRow: {
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heroTypePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(5,16,30,0.40)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.34)',
    },
    heroTypeText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.9 },
    heroActions: { flexDirection: 'row', gap: 7 },
    heroIconButton: {
      width: 38,
      height: 38,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(5,16,30,0.38)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.34)',
    },
    heroIconButtonDisabled: { opacity: 0.36 },
    heroCopy: { position: 'absolute', left: 16, right: 16, bottom: 15 },
    title: {
      color: '#fff',
      fontFamily: 'Manrope_700Bold',
      fontSize: 28,
      lineHeight: 33,
      textShadowColor: 'rgba(0,0,0,0.28)',
      textShadowRadius: 8,
    },
    heroMeta: { marginTop: 5, color: 'rgba(255,255,255,0.88)', fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
    memoryControls: {
      marginTop: 10,
      padding: 12,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: accentBorder,
      backgroundColor: glassStrong,
    },
    noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 3, paddingBottom: 11 },
    noteIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.accentSoft,
    },
    note: { flex: 1, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, paddingTop: 5 },
    actionRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
    addButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.welcome.brandInk,
    },
    addButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
    secondaryButton: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: accentBorder,
      backgroundColor: glass,
    },
    secondaryButtonDisabled: { opacity: 0.40 },
    secondaryButtonText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 11 },
    deleteButton: {
      width: 44,
      minHeight: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#efcaca',
      backgroundColor: '#fff7f7',
    },
    autoCoverHint: { marginTop: 8, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 10.5, textAlign: 'center' },
    tile: { marginBottom: 4, backgroundColor: theme.colors.surfaceSoft, overflow: 'hidden', borderRadius: 3 },
    tileImage: { width: '100%', height: '100%' },
    coverTile: { borderWidth: 2, borderColor: theme.circle.accent },
    coverTileBadge: {
      position: 'absolute',
      left: 5,
      bottom: 5,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(5,16,30,0.58)',
    },
    coverTileBadgeText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 0.6 },
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingVertical: 70, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: accentBorder, backgroundColor: glass },
    emptyTitle: { marginTop: 10, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 17 },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: glassStrong,
    },
    stateText: { marginTop: 9, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 13, textAlign: 'center' },
    errorText: { marginTop: 10, color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', fontSize: 13, textAlign: 'center' },
    retryButton: {
      marginTop: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.circle.accentSoft,
    },
    retryText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    viewerScreen: { flex: 1, backgroundColor: '#000' },
    viewerHeader: { height: 58, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    viewerIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    viewerImageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    viewerImage: { width: '100%', height: '100%' },
    viewerFooter: { padding: 16, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 10 },
    viewerMetaCopy: { flex: 1 },
    viewerUploader: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
    viewerDate: { marginTop: 2, color: '#b8b8bd', fontFamily: 'Manrope_400Regular', fontSize: 11 },
    coverPickerScreen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    coverPickerHeader: { paddingHorizontal: 18, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    coverPickerHeading: { flex: 1 },
    coverPickerEyebrow: { color: theme.circle.accent, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 1.1 },
    coverPickerTitle: { marginTop: 4, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 22, lineHeight: 27 },
    coverPickerClose: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceSoft },
    coverPickerIntro: { marginTop: 8, paddingHorizontal: 18, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12, lineHeight: 18 },
    coverPickerContent: { padding: 18, paddingBottom: 50 },
    autoCoverCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, marginBottom: 16 },
    autoCoverCardSelected: { borderColor: theme.circle.accent },
    autoCoverCopy: { padding: 12 },
    autoCoverTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    autoCoverTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
    autoCoverText: { marginTop: 3, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11 },
    selectedCheck: { position: 'absolute', right: 10, top: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: theme.circle.accent, alignItems: 'center', justifyContent: 'center' },
    coverPhotoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    coverPhotoChoice: { width: '32%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: theme.colors.surfaceSoft },
    coverPhotoChoiceImage: { width: '100%', height: '100%' },
    coverChoiceBadge: { position: 'absolute', right: 6, top: 6, minWidth: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(5,16,30,0.62)', alignItems: 'center', justifyContent: 'center' },
    coverChoiceBadgeSelected: { backgroundColor: theme.circle.accent },
    coverPickerEmpty: { alignItems: 'center', paddingVertical: 46, borderRadius: 18, backgroundColor: theme.colors.surfaceSoft },
    coverPickerEmptyText: { marginTop: 8, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12 },
    pressed: { opacity: 0.68 },
  });
}
