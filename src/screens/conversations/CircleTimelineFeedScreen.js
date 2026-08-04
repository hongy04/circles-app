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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../../components/Avatar';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { timeAgo } from '../../utils/timeAgo';
import {
  listConversationTimeline,
  subscribeToConversationChanges,
} from '../../services/conversationService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

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

function TimelineFeedCard({ group, width, height, navigation, styles, theme }) {
  return (
    <View style={[styles.card, { height }]}>
      <Pressable
        onPress={() => group.senderId && navigation.navigate('Profile', { userId: group.senderId })}
        style={({ pressed }) => [styles.authorRow, pressed && styles.pressed]}
      >
        <Avatar size={40} name={group.senderName} uri={group.senderAvatar} />
        <View style={styles.authorText}>
          <Text style={styles.authorName} numberOfLines={1}>{group.senderName}</Text>
          <View style={styles.privateTimeRow}>
            <Ionicons name="time-outline" size={11} color={theme.colors.subtext} />
            <Text style={styles.time}>{timeAgo(group.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.archivePill}>
          <Ionicons name="chatbubble-ellipses-outline" size={11} color={theme.colors.text} />
          <Text style={styles.archiveLabel}>From Chat</Text>
        </View>
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
          <View style={styles.mediaCountPill}>
            <Ionicons name="copy-outline" size={11} color={theme.colors.text} />
            <Text style={styles.mediaCount}>{group.media.length} shared items</Text>
          </View>
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

function CircleTimelineFeedContent({ route, navigation }) {
  const { conversationId, initialMediaId } = route.params || {};
  const cachedItems = readNavigationCache(navigationCacheKeys.circleTimeline(conversationId));
  const hasInitialItems = Array.isArray(cachedItems);
  const initialItems = hasInitialItems ? cachedItems : [];
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const stageWidth = Math.min(width - 24, 696);
  const cardHeight = stageWidth + 166;
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(!hasInitialItems);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(hasInitialItems);

  const load = useCallback(async ({ refresh = false, quiet = false } = {}) => {
    if (refresh) setRefreshing(true);
    else if (!quiet) setLoading(true);
    setError('');

    try {
      const nextItems = await listConversationTimeline(conversationId);
      setItems(nextItems);
      writeNavigationCache(navigationCacheKeys.circleTimeline(conversationId), nextItems);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load this Circle Timeline.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      void load({ quiet: hasLoadedRef.current }).finally(() => {
        hasLoadedRef.current = true;
      });
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
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.stateText}>Opening Timeline…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>

      {error && !groups.length ? (
        <View style={styles.centerState}>
          <View style={styles.stateIcon}>
            <Ionicons name="alert-circle-outline" size={28} color={theme.colors.text} />
          </View>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          initialScrollIndex={groups.length ? initialIndex : undefined}
          getItemLayout={(_, index) => ({
            length: cardHeight + 12,
            offset: (cardHeight + 12) * index,
            index,
          })}
          renderItem={({ item }) => (
            <TimelineFeedCard
              group={item}
              width={stageWidth}
              height={cardHeight}
              navigation={navigation}
              styles={styles}
              theme={theme}
            />
          )}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ refresh: true })}
              tintColor={theme.circle.accent}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.centerState}>
              <View style={styles.stateIcon}>
                <Ionicons name="images-outline" size={28} color={theme.colors.text} />
              </View>
              <Text style={styles.errorText}>No Timeline media yet.</Text>
              <Text style={styles.emptyBody}>Photos and videos shared in Chat will gather here automatically.</Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

export function CircleTimelineFeedScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CircleTimelineFeedContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    listContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 34, flexGrow: 1 },
    card: {
      width: '100%',
      maxWidth: 696,
      alignSelf: 'center',
      marginBottom: 12,
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      overflow: 'hidden',
      shadowColor: theme.circle.accent,
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,
    },
    authorRow: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
    authorText: { flex: 1, marginLeft: 10 },
    authorName: { fontFamily: 'Manrope_700Bold', color: theme.colors.text },
    privateTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    time: { fontFamily: 'Manrope_400Regular', color: theme.colors.subtext, fontSize: 11 },
    archivePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: theme.circle.accentSoft,
    },
    archiveLabel: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 9 },
    mediaPage: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
    media: { width: '100%', height: '100%' },
    videoPage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' },
    details: { flex: 1, paddingHorizontal: 13, paddingVertical: 12 },
    mediaCountPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 7,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.circle.accentSoft,
    },
    mediaCount: { color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
    caption: { color: theme.colors.text, fontFamily: 'Manrope_400Regular', lineHeight: 19 },
    captionAuthor: { fontFamily: 'Manrope_700Bold' },
    captionMuted: { color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
    centerState: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: theme.circle.profileBackground },
    stateIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: theme.circle.accentSoft },
    stateText: { marginTop: 10, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
    errorText: { marginTop: 12, color: theme.colors.text, fontFamily: 'Manrope_700Bold', textAlign: 'center' },
    emptyBody: { maxWidth: 320, marginTop: 6, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
    retryButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.welcome.brandInk },
    retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
    pressed: { opacity: 0.72 },
  });
}
