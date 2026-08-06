import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { AlbumMemoryCover } from '../../components/circles/AlbumMemoryCover';
import { CircleBackdrop } from '../../components/circles/CircleBackdrop';
import { MemoryLiftSurface } from '../../components/memories/MemoryLiftSurface';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  listTwoPersonAlbums,
  subscribeToTwoPersonAlbumChanges,
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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function memoryCardLayout(index) {
  const mod = index % 4;
  if (mod === 0) return { height: 222, width: '100%', alignSelf: 'stretch' };
  if (mod === 1) return { height: 188, width: '94%', alignSelf: 'flex-start' };
  if (mod === 2) return { height: 204, width: '94%', alignSelf: 'flex-end' };
  return { height: 194, width: '100%', alignSelf: 'stretch' };
}

function AlbumCard({ album, index, onPress, styles, theme }) {
  const layout = memoryCardLayout(index);
  const hasSelectedCover = Boolean(album.coverPhotoId && album.coverUrl);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.memoryCard,
        { width: layout.width, alignSelf: layout.alignSelf },
        pressed && styles.pressed,
      ]}
    >
      <AlbumMemoryCover
        coverUrl={album.coverUrl}
        previewUrls={album.previewUrls}
        height={layout.height}
        borderRadius={24}
      >
        <View style={styles.memoryTopRow}>
          <View style={styles.memoryTypePill}>
            <Ionicons name="images-outline" size={12} color="#fff" />
            <Text style={styles.memoryTypeText}>SHARED ALBUM</Text>
          </View>
          {hasSelectedCover ? (
            <View style={styles.customCoverPill}>
              <Ionicons name="sparkles" size={11} color="#fff" />
              <Text style={styles.customCoverText}>COVER</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.memoryCopy}>
          <Text style={styles.memoryTitle} numberOfLines={2}>{album.title}</Text>
          <View style={styles.memoryMetaRow}>
            <Text style={styles.memoryMeta}>
              {album.photoCount} photo{album.photoCount === 1 ? '' : 's'}
              {album.occurredOn ? ` · ${formatDate(album.occurredOn)}` : ''}
            </Text>
            <Ionicons name="arrow-forward-circle" size={21} color="rgba(255,255,255,0.92)" />
          </View>
          {album.note ? (
            <Text style={styles.memoryNote} numberOfLines={2}>{album.note}</Text>
          ) : null}
        </View>
      </AlbumMemoryCover>
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
  const scrapbookScrollY = useSharedValue(0);
  const handleScrapbookScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrapbookScrollY.value = event.contentOffset.y;
    },
  });
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
      <CircleBackdrop conversationId={conversationId} imageTintOpacity={0.08} />
      <Animated.FlatList
        data={albums}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load({ quiet: true });
            }}
            tintColor={theme.circle.accent}
          />
        )}
        ListHeaderComponent={(
          <View style={styles.introCard}>
            <View style={styles.introCopy}>
              <Text style={styles.eyebrow}>OUR SCRAPBOOK</Text>
              <Text style={styles.introTitle}>Shared albums</Text>
              <Text style={styles.introText}>
                Little collections from the life you have shared together.
              </Text>
            </View>
            <Pressable
              onPress={createAlbum}
              style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={19} color="#fff" />
              <Text style={styles.createButtonText}>New Album</Text>
            </Pressable>
            {error && albums.length ? <Text style={styles.inlineError}>{error}</Text> : null}
          </View>
        )}
        renderItem={({ item, index }) => (
          <MemoryLiftSurface
            scrollY={scrapbookScrollY}
            focusRatio={0.55}
            minScale={0.964}
            maxScale={1.02}
            lift={9}
          >
            <AlbumCard
              album={item}
              index={index}
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
          </MemoryLiftSurface>
        )}
        onScroll={handleScrapbookScroll}
        scrollEventThrottle={16}
        ListEmptyComponent={loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={theme.circle.accent} />
            <Text style={styles.stateText}>Opening your scrapbook…</Text>
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
            <Ionicons name="images-outline" size={42} color={theme.circle.accent} />
            <Text style={styles.emptyTitle}>Your scrapbook starts here</Text>
            <Text style={styles.stateText}>
              Make an album when a set of photos deserves its own little place.
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
  const glass = rgba(theme.colors.surface, 0.78);
  const glassStrong = rgba(theme.colors.surface, 0.90);
  const accentBorder = rgba(theme.circle.accent, 0.22);

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    content: { paddingHorizontal: 14, paddingBottom: 56, flexGrow: 1 },
    introCard: {
      marginTop: 12,
      marginBottom: 16,
      padding: 16,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: accentBorder,
      backgroundColor: glassStrong,
    },
    introCopy: { paddingHorizontal: 2 },
    eyebrow: {
      color: theme.circle.accent,
      fontFamily: 'Manrope_700Bold',
      fontSize: 10,
      letterSpacing: 1.2,
    },
    introTitle: {
      marginTop: 3,
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 24,
      letterSpacing: -0.4,
    },
    introText: {
      marginTop: 5,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 13,
      lineHeight: 19,
    },
    createButton: {
      marginTop: 14,
      minHeight: 44,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: theme.welcome.brandInk,
    },
    createButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
    inlineError: { marginTop: 10, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    memoryCard: {
      marginBottom: 14,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: rgba('#ffffff', 0.54),
      backgroundColor: glass,
      shadowColor: '#0b2034',
      shadowOpacity: 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,
    },
    memoryTopRow: {
      position: 'absolute',
      left: 12,
      right: 12,
      top: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    memoryTypePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(5,16,30,0.42)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.35)',
    },
    memoryTypeText: {
      color: '#fff',
      fontFamily: 'Manrope_700Bold',
      fontSize: 9,
      letterSpacing: 0.8,
    },
    customCoverPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(5,16,30,0.32)',
    },
    customCoverText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.7 },
    memoryCopy: { position: 'absolute', left: 15, right: 15, bottom: 14 },
    memoryTitle: {
      color: '#fff',
      fontFamily: 'Manrope_700Bold',
      fontSize: 23,
      lineHeight: 28,
      textShadowColor: 'rgba(0,0,0,0.28)',
      textShadowRadius: 8,
    },
    memoryMetaRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 8 },
    memoryMeta: { flex: 1, color: 'rgba(255,255,255,0.88)', fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
    memoryNote: {
      marginTop: 6,
      maxWidth: '90%',
      color: 'rgba(255,255,255,0.84)',
      fontFamily: 'Manrope_400Regular',
      fontSize: 12,
      lineHeight: 17,
    },
    state: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      paddingVertical: 58,
      paddingHorizontal: 20,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: accentBorder,
      backgroundColor: glassStrong,
    },
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
    pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
  });
}
