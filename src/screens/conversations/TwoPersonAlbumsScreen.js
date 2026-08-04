import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  listTwoPersonAlbums,
  subscribeToTwoPersonAlbumChanges,
} from '../../services/twoPersonAlbumService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function AlbumCard({ album, onPress, styles, theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {album.coverUrl ? (
        <Image source={{ uri: album.coverUrl }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Ionicons name="images-outline" size={34} color={theme.colors.text} />
        </View>
      )}
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle} numberOfLines={1}>{album.title}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {album.photoCount} photo{album.photoCount === 1 ? '' : 's'}
          {album.occurredOn ? ` · ${formatDate(album.occurredOn)}` : ''}
        </Text>
        {album.note ? (
          <Text style={styles.cardNote} numberOfLines={2}>{album.note}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
    </Pressable>
  );
}

function TwoPersonAlbumsContent({ route, navigation }) {
  const { conversationId, circleName = 'Our Circle' } = route.params || {};
  const cachedAlbums = readNavigationCache(navigationCacheKeys.twoPersonAlbums(conversationId));
  const hasInitialAlbums = Array.isArray(cachedAlbums);
  const initialAlbums = hasInitialAlbums ? cachedAlbums : [];
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [albums, setAlbums] = useState(initialAlbums);
  const [loading, setLoading] = useState(!hasInitialAlbums);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(hasInitialAlbums);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const nextAlbums = await listTwoPersonAlbums(conversationId);
      setAlbums(nextAlbums);
      writeNavigationCache(navigationCacheKeys.twoPersonAlbums(conversationId), nextAlbums);
      nextAlbums.forEach((album) => {
        writeNavigationCache(navigationCacheKeys.album(album.id), album);
      });
    } catch (loadError) {
      setError(loadError?.message || 'Could not load shared albums.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

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

  const createAlbum = () => navigation.navigate('TwoPersonAlbumEditor', {
    conversationId,
    circleName,
  });

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={albums}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load({ quiet: true });
            }}
            tintColor={theme.colors.text}
          />
        )}
        ListHeaderComponent={(
          <View style={styles.topActions}>
            <Pressable
              onPress={createAlbum}
              style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.createButtonText}>New Album</Text>
            </Pressable>
            {error && albums.length ? <Text style={styles.inlineError}>{error}</Text> : null}
          </View>
        )}
        renderItem={({ item }) => (
          <AlbumCard
            album={item}
            styles={styles}
            theme={theme}
            onPress={() => {
              writeNavigationCache(navigationCacheKeys.album(item.id), item);
              navigation.navigate('TwoPersonAlbumDetail', {
                albumId: item.id,
                conversationId,
                circleName,
              });
            }}
          />
        )}
        ListEmptyComponent={loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={theme.circle.accent} />
            <Text style={styles.stateText}>Opening shared albums…</Text>
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Ionicons name="alert-circle-outline" size={34} color={theme.circle.accent} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => load()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.state}>
            <Ionicons name="images-outline" size={40} color={theme.circle.accent} />
            <Text style={styles.emptyTitle}>No shared albums yet</Text>
            <Text style={styles.stateText}>
              Create one when a set of photos deserves its own place.
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

export function TwoPersonAlbumsScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <TwoPersonAlbumsContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    content: { paddingHorizontal: 14, paddingBottom: 48, flexGrow: 1 },
    topActions: { paddingTop: 14, paddingBottom: 12 },
    createButton: {
      minHeight: 44,
      borderRadius: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: theme.welcome.brandInk,
    },
    createButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
    inlineError: { marginTop: 10, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    card: {
      minHeight: 106,
      marginBottom: 12,
      padding: 10,
      borderRadius: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      backgroundColor: theme.colors.surface,
    },
    cover: { width: 86, height: 86, borderRadius: 14, backgroundColor: theme.colors.surfaceSoft },
    coverPlaceholder: {
      width: 86,
      height: 86,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.accentSoft,
    },
    cardCopy: { flex: 1 },
    cardTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 16 },
    cardMeta: {
      marginTop: 4,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 11,
    },
    cardNote: {
      marginTop: 6,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 12,
      lineHeight: 17,
    },
    state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 54, paddingHorizontal: 20 },
    stateText: {
      marginTop: 9,
      maxWidth: 340,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    emptyTitle: { marginTop: 10, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 17 },
    errorText: {
      marginTop: 10,
      color: theme.colors.text,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 13,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.circle.accentSoft,
    },
    retryText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    pressed: { opacity: 0.65 },
  });
}
