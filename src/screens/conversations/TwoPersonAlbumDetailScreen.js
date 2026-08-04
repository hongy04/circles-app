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
import { CircleBackdrop } from '../../components/circles/CircleBackdrop';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  deleteTwoPersonAlbum,
  deleteTwoPersonAlbumPhoto,
  getTwoPersonAlbum,
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
  const [error, setError] = useState('');

  const columns = width >= 720 ? 4 : 3;
  const maxContentWidth = Math.min(width, 760);
  const gap = 4;
  const tileSize = useMemo(
    () => Math.floor((maxContentWidth - 24 - gap * (columns - 1)) / columns),
    [columns, gap, maxContentWidth]
  );

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!albumId) return;
    if (!quiet) setLoading(true);
    if (quiet) setPhotosHydrating(true);
    setError('');
    try {
      const nextAlbum = await getTwoPersonAlbum(albumId);
      setAlbum(nextAlbum);
      writeNavigationCache(navigationCacheKeys.album(albumId), nextAlbum);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this shared album.');
    } finally {
      setLoading(false);
      setPhotosHydrating(false);
    }
  }, [albumId]);

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
      setAlbum((current) => current ? {
        ...current,
        photoCount: current.photoCount + uploaded.length,
        photos: [...uploaded.reverse(), ...(current.photos || [])],
        coverUrl: current.coverUrl || uploaded[0]?.url || null,
      } : current);
    } catch (uploadError) {
      Alert.alert('Could not add photos', uploadError?.message || 'Please try again.');
      load({ quiet: true });
    } finally {
      setUploading(false);
      setUploadStage('');
    }
  };

  const removePhoto = (photo) => {
    Alert.alert(
      'Remove this photo?',
      'It will disappear from this shared album for both people.',
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
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{album.title}</Text>
          {album.occurredOn ? <Text style={styles.date}>{formatDate(album.occurredOn)}</Text> : null}
        </View>
        <Pressable
          onPress={() => navigation.navigate('TwoPersonAlbumEditor', {
            albumId,
            conversationId,
            circleName,
          })}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="create-outline" size={19} color={theme.colors.text} />
        </Pressable>
      </View>
      {album.note ? <Text style={styles.note}>{album.note}</Text> : null}
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
          onPress={removeAlbum}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={18} color="#c62828" />
        </Pressable>
      </View>
      <View style={styles.photoCountPill}>
        <Ionicons name="images-outline" size={13} color={theme.colors.text} />
        <Text style={styles.photoCount}>{album.photoCount} photo{album.photoCount === 1 ? '' : 's'}</Text>
      </View>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.screen}>
      <CircleBackdrop conversationId={conversationId} imageTintOpacity={0.10} />
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
              pressed && styles.pressed,
            ]}
          >
            <Image source={{ uri: item.url }} style={styles.tileImage} />
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
            <Text style={styles.stateText}>Add the first photos that belong in this album.</Text>
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
  const glass = rgba(theme.colors.surface, 0.84);
  const glassStrong = rgba(theme.colors.surface, 0.93);
  const accentBorder = rgba(theme.circle.accent, 0.20);

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    content: { paddingHorizontal: 12, paddingBottom: 48, flexGrow: 1 },
    header: { marginTop: 12, marginBottom: 14, padding: 16, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: accentBorder, backgroundColor: glassStrong },
    headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    headingCopy: { flex: 1 },
    title: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 24 },
    date: { marginTop: 4, color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    note: { marginTop: 12, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 20 },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: accentBorder,
      backgroundColor: glassStrong,
    },
    actionRow: { marginTop: 16, flexDirection: 'row', gap: 8 },
    addButton: {
      flex: 1,
      minHeight: 45,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: theme.welcome.brandInk,
    },
    addButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 14 },
    deleteButton: {
      width: 48,
      minHeight: 45,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#efcaca',
      backgroundColor: '#fff7f7',
    },
    photoCountPill: {
      marginTop: 14,
      alignSelf: 'flex-start',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: theme.circle.accentSoft,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    photoCount: { color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
    tile: { marginBottom: 4, backgroundColor: theme.colors.surfaceSoft, overflow: 'hidden' },
    tileImage: { width: '100%', height: '100%' },
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
    pressed: { opacity: 0.65 },
  });
}
