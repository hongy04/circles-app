import React, { useCallback, useState } from 'react';
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

import { COLORS } from '../../theme/colors';
import {
  listTwoPersonAlbums,
  subscribeToTwoPersonAlbumChanges,
} from '../../services/twoPersonAlbumService';

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

function AlbumCard({ album, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {album.coverUrl ? (
        <Image source={{ uri: album.coverUrl }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Ionicons name="images-outline" size={34} color={COLORS.subtext} />
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
      <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
    </Pressable>
  );
}

export function TwoPersonAlbumsScreen({ route, navigation }) {
  const { conversationId, circleName = 'Our Circle' } = route.params || {};
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      setAlbums(await listTwoPersonAlbums(conversationId));
    } catch (loadError) {
      setError(loadError?.message || 'Could not load shared albums.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  useFocusEffect(useCallback(() => {
    load();
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
            tintColor={COLORS.text}
          />
        )}
        ListHeaderComponent={(
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="albums-outline" size={24} color={COLORS.text} />
            </View>
            <Text style={styles.title}>Shared Albums</Text>
            <Text style={styles.body}>
              Keep deliberate photo collections for trips, dates, and moments that belong together.
            </Text>
            <Pressable
              onPress={createAlbum}
              style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.createButtonText}>New Album</Text>
            </Pressable>
          </View>
        )}
        renderItem={({ item }) => (
          <AlbumCard
            album={item}
            onPress={() => navigation.navigate('TwoPersonAlbumDetail', {
              albumId: item.id,
              conversationId,
              circleName,
            })}
          />
        )}
        ListEmptyComponent={loading ? (
          <View style={styles.state}>
            <ActivityIndicator />
            <Text style={styles.stateText}>Opening shared albums…</Text>
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Ionicons name="alert-circle-outline" size={34} color={COLORS.text} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => load()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.state}>
            <Ionicons name="images-outline" size={40} color={COLORS.subtext} />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 18, paddingBottom: 48, flexGrow: 1 },
  header: { alignItems: 'center', marginBottom: 20 },
  headerIcon: {
    width: 52, height: 52, borderRadius: 18, alignItems: 'center',
    justifyContent: 'center', backgroundColor: '#f2f2f5',
  },
  title: {
    marginTop: 12, color: COLORS.text, fontFamily: 'Manrope_700Bold',
    fontSize: 24,
  },
  body: {
    marginTop: 7, maxWidth: 440, color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 20,
    textAlign: 'center',
  },
  createButton: {
    marginTop: 16, minHeight: 44, paddingHorizontal: 18, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: COLORS.text,
  },
  createButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 14 },
  card: {
    minHeight: 106, marginBottom: 12, padding: 10, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  cover: { width: 86, height: 86, borderRadius: 14, backgroundColor: '#eee' },
  coverPlaceholder: {
    width: 86, height: 86, borderRadius: 14, alignItems: 'center',
    justifyContent: 'center', backgroundColor: '#f1f1f4',
  },
  cardCopy: { flex: 1 },
  cardTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 16 },
  cardMeta: {
    marginTop: 4, color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 11,
  },
  cardNote: {
    marginTop: 6, color: COLORS.subtext, fontFamily: 'Manrope_400Regular',
    fontSize: 12, lineHeight: 17,
  },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 54 },
  stateText: {
    marginTop: 9, maxWidth: 340, color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center',
  },
  emptyTitle: {
    marginTop: 10, color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 17,
  },
  errorText: {
    marginTop: 10, color: COLORS.text, fontFamily: 'Manrope_600SemiBold',
    fontSize: 13, textAlign: 'center',
  },
  retryButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#eee' },
  retryText: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  pressed: { opacity: 0.65 },
});
