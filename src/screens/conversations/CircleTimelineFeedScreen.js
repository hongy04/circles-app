import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import { timeAgo } from '../../utils/timeAgo';
import {
  listConversationTimeline,
  subscribeToConversationChanges,
} from '../../services/conversationService';

function groupTimeline(items) {
  const groups = [];
  const byKey = new Map();

  (items || []).forEach((item) => {
    const key = item.messageId || item.id;
    let group = byKey.get(key);
    if (!group) {
      group = {
        id: key,
        senderId: item.senderId,
        senderName: item.senderName || 'Circle member',
        senderAvatar: item.senderAvatar || null,
        messageBody: item.messageBody || '',
        createdAt: item.createdAt,
        media: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.media.push(item);
  });

  return groups;
}

function TimelineFeedCard({ group, width, height, navigation }) {
  return (
    <View style={[styles.card, { height }]}>
      <Pressable
        onPress={() => group.senderId && navigation.navigate('Profile', { userId: group.senderId })}
        style={styles.authorRow}
      >
        <Avatar size={40} name={group.senderName} uri={group.senderAvatar} />
        <View style={styles.authorText}>
          <Text style={styles.authorName} numberOfLines={1}>{group.senderName}</Text>
          <View style={styles.privateTimeRow}>
            <Ionicons name="time-outline" size={11} color={COLORS.subtext} />
            <Text style={styles.time}>{timeAgo(group.createdAt)}</Text>
          </View>
        </View>
        <Text style={styles.archiveLabel}>From Chat</Text>
      </Pressable>

      <FlatList
        horizontal
        style={{ height: width, flexGrow: 0 }}
        pagingEnabled
        data={group.media}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => navigation.navigate('ConversationMedia', {
              items: group.media,
              startIndex: index,
            })}
            style={[styles.mediaPage, { width, height: width }]}
          >
            {item.mediaType === 'image' ? (
              <Image source={{ uri: item.url }} style={styles.media} resizeMode="cover" />
            ) : (
              <View style={styles.videoPage}>
                <Ionicons name="play-circle" size={62} color="#fff" />
              </View>
            )}
          </Pressable>
        )}
      />

      <View style={styles.details}>
        {group.media.length > 1 ? (
          <Text style={styles.mediaCount}>{group.media.length} shared items</Text>
        ) : null}
        {group.messageBody ? (
          <Text numberOfLines={3} style={styles.caption}>
            <Text style={styles.captionAuthor}>{group.senderName} </Text>
            {group.messageBody}
          </Text>
        ) : (
          <Text style={styles.captionMuted}>Shared in the private Circle chat.</Text>
        )}
      </View>
    </View>
  );
}

export function CircleTimelineFeedScreen({ route, navigation }) {
  const { conversationId, initialMediaId, circleName } = route.params || {};
  const { width } = useWindowDimensions();
  const stageWidth = Math.min(width, 720);
  const cardHeight = stageWidth + 138;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ refresh = false, quiet = false } = {}) => {
    if (refresh) setRefreshing(true);
    else if (!quiet) setLoading(true);
    setError('');

    try {
      setItems(await listConversationTimeline(conversationId));
    } catch (loadError) {
      setError(loadError?.message || 'Could not load this Circle Timeline.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
      return subscribeToConversationChanges({
        conversationId,
        onMessage: () => load({ quiet: true }),
        onMediaChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  const groups = useMemo(() => groupTimeline(items), [items]);
  const initialIndex = useMemo(() => {
    const index = groups.findIndex((group) =>
      group.media.some((item) => item.id === initialMediaId)
    );
    return index >= 0 ? index : 0;
  }, [groups, initialMediaId]);

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening Timeline…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.contextBar}>
        <Ionicons name="lock-closed" size={11} color={COLORS.subtext} />
        <Text style={styles.contextText} numberOfLines={1}>
          {circleName || 'Circle'} · automatic archive from Chat
        </Text>
      </View>

      {error && !groups.length ? (
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={36} color={COLORS.subtext} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          key={`${initialIndex}-${groups.length}`}
          data={groups}
          keyExtractor={(item) => item.id}
          initialScrollIndex={groups.length ? initialIndex : undefined}
          getItemLayout={(_, index) => ({
            length: cardHeight,
            offset: cardHeight * index,
            index,
          })}
          renderItem={({ item }) => (
            <TimelineFeedCard
              group={item}
              width={stageWidth}
              height={cardHeight}
              navigation={navigation}
            />
          )}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ refresh: true })}
              tintColor={COLORS.text}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.centerState}>
              <Ionicons name="images-outline" size={38} color={COLORS.subtext} />
              <Text style={styles.errorText}>No Timeline media yet.</Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  contextBar: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  contextText: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  listContent: { paddingBottom: 34 },
  card: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    backgroundColor: COLORS.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    overflow: 'hidden',
  },
  authorRow: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  authorText: { flex: 1, marginLeft: 10 },
  authorName: { fontFamily: 'Manrope_700Bold', color: COLORS.text },
  privateTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  time: { fontFamily: 'Manrope_400Regular', color: COLORS.subtext, fontSize: 11 },
  archiveLabel: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  mediaPage: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  videoPage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' },
  details: { flex: 1, paddingHorizontal: 12, paddingTop: 10 },
  mediaCount: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 11, marginBottom: 5 },
  caption: { color: COLORS.text, fontFamily: 'Manrope_400Regular', lineHeight: 19 },
  captionAuthor: { fontFamily: 'Manrope_700Bold' },
  captionMuted: { color: COLORS.subtext, fontFamily: 'Manrope_400Regular' },
  centerState: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: COLORS.bg },
  stateText: { marginTop: 10, color: COLORS.subtext, fontFamily: 'Manrope_400Regular' },
  errorText: { marginTop: 12, color: COLORS.text, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.primary },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
});
