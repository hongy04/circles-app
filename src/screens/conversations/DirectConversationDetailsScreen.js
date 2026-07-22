import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
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
import {
  getConversationDetails,
  listConversationTimeline,
  subscribeToConversationChanges,
} from '../../services/conversationService';

function SharedMediaTile({ item, size, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.mediaTile,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
    >
      {item.mediaType === 'image' ? (
        <Image source={{ uri: item.url }} style={styles.mediaImage} />
      ) : (
        <View style={styles.videoTile}>
          <Ionicons name="play" size={28} color="#fff" />
        </View>
      )}

      {item.mediaType === 'video' ? (
        <View style={styles.videoBadge}>
          <Ionicons name="videocam" size={13} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

export function DirectConversationDetailsScreen({ route, navigation }) {
  const { conversationId } = route.params || {};
  const { width } = useWindowDimensions();
  const [details, setDetails] = useState(null);
  const [sharedMedia, setSharedMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');

    try {
      const detailRows = await getConversationDetails(conversationId);
      const conversation = detailRows?.conversation;
      const isCircle = conversation?.is_circle == null
        ? conversation?.kind === 'group'
        : Boolean(conversation.is_circle);

      if (conversation?.kind !== 'direct' || isCircle) {
        throw new Error('This conversation uses a Circle profile instead.');
      }

      const mediaRows = await listConversationTimeline(conversationId);
      setDetails(detailRows);
      setSharedMedia(mediaRows);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open conversation details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      return subscribeToConversationChanges({
        conversationId,
        onMessage: () => load({ quiet: true }),
        onMediaChange: () => load({ quiet: true }),
        onConversationChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  const conversation = details?.conversation;
  const otherUserId = conversation?.other_user_id
    || (details?.members || []).find((member) => !member.is_me)?.user_id
    || null;
  const gridWidth = Math.min(width, 720);
  const tileSize = Math.floor(gridWidth / 3);

  const viewerItems = useMemo(
    () => sharedMedia.map((item) => ({
      ...item,
      senderName: item.senderName || conversation?.title || 'Connection',
    })),
    [conversation?.title, sharedMedia]
  );

  const header = conversation ? (
    <>
      <View style={styles.profileHeader}>
        <Avatar
          size={92}
          name={conversation.title || 'Connection'}
          uri={conversation.avatar_url}
        />
        <Text style={styles.title}>{conversation.title}</Text>
        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed" size={12} color={COLORS.subtext} />
          <Text style={styles.privacyText}>Private direct conversation</Text>
        </View>

        {otherUserId ? (
          <Pressable
            onPress={() => navigation.navigate('Profile', {
              userId: otherUserId,
            })}
            style={({ pressed }) => [
              styles.profileButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="person-outline" size={17} color={COLORS.text} />
            <Text style={styles.profileButtonText}>View Profile</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Shared Media</Text>
        <Text style={styles.sectionCount}>{sharedMedia.length}</Text>
      </View>
    </>
  ) : null;

  if (loading && !conversation) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening conversation details…</Text>
      </SafeAreaView>
    );
  }

  if (error && !conversation) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="lock-closed-outline" size={36} color={COLORS.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.contentWidth}>
        <FlatList
          data={sharedMedia}
          keyExtractor={(item) => item.id}
          numColumns={3}
          ListHeaderComponent={header}
          renderItem={({ item, index }) => (
            <SharedMediaTile
              item={item}
              size={tileSize}
              onPress={() => navigation.navigate('ConversationMedia', {
                items: viewerItems,
                startIndex: index,
              })}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={38} color={COLORS.subtext} />
              <Text style={styles.emptyTitle}>No shared media yet</Text>
              <Text style={styles.emptyBody}>
                Photos and videos sent in this direct chat will stay available
                here. This is a private media archive, not a Circle profile or
                public feed.
              </Text>
            </View>
          )}
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
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  contentWidth: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderLeftWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
    borderRightWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
    borderColor: COLORS.border,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 44,
  },
  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
  },
  title: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
    textAlign: 'center',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  privacyText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  profileButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 18,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f4f4f4',
  },
  profileButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  sectionHeader: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  sectionCount: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  mediaTile: {
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: COLORS.bg,
    backgroundColor: '#ececec',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  videoTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1c1e',
  },
  videoBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 36,
    paddingVertical: 54,
  },
  emptyTitle: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  emptyBody: {
    maxWidth: 430,
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  retryText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  pressed: {
    opacity: 0.7,
  },
});
