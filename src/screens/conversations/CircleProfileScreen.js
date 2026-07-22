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

function Stat({ value, label, onPress }) {
  const content = (
    <>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );

  if (!onPress) return <View style={styles.stat}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

function TimelineTile({ item, size, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.timelineTile,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
    >
      {item.mediaType === 'image' ? (
        <Image source={{ uri: item.url }} style={styles.tileMedia} />
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

export function CircleProfileScreen({ route, navigation }) {
  const { conversationId } = route.params || {};
  const { width } = useWindowDimensions();
  const [details, setDetails] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [activeTab, setActiveTab] = useState('timeline');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');

    try {
      const detailRows = await getConversationDetails(conversationId);
      const isCircle = detailRows?.conversation?.is_circle == null
        ? detailRows?.conversation?.kind === 'group'
        : Boolean(detailRows.conversation.is_circle);

      if (!isCircle) {
        throw new Error('This direct chat has no Circle profile.');
      }

      const timelineRows = await listConversationTimeline(conversationId);
      setDetails(detailRows);
      setTimeline(timelineRows);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this private Circle.');
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
  const members = details?.members || [];
  const gridWidth = Math.min(width, 720);
  const tileSize = Math.floor(gridWidth / 3);

  const viewerItems = useMemo(
    () => timeline.map((item) => ({
      ...item,
      senderName: item.senderName || 'Circle member',
    })),
    [timeline]
  );

  const header = conversation ? (
    <>
      <View style={styles.profileHeader}>
        <Avatar
          size={92}
          name={conversation.title}
          uri={conversation.avatar_url}
        />

        <Text style={styles.title}>{conversation.title}</Text>

        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed" size={12} color={COLORS.subtext} />
          <Text style={styles.privacyText}>
            {conversation.kind === 'group'
              ? 'Invitation-only Circle'
              : 'Mutually created two-person Circle'}
          </Text>
        </View>

        <Text style={styles.bio}>
          {conversation.bio || 'A private shared profile for this Circle.'}
        </Text>

        <View style={styles.statsRow}>
          <Stat
            value={Number(conversation.timeline_count || timeline.length)}
            label="Timeline"
            onPress={() => setActiveTab('timeline')}
          />
          <Stat
            value={Number(conversation.post_count || 0)}
            label="Posts"
            onPress={() => setActiveTab('posts')}
          />
          <Stat value={members.length} label="Members" />
        </View>

        {conversation.can_edit ? (
          <Pressable
            onPress={() => navigation.navigate('EditCircle', {
              conversationId,
            })}
            style={({ pressed }) => [
              styles.editButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.editButtonText}>Edit Circle</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.membersStrip}>
        <Text style={styles.membersHeading}>Members</Text>
        <FlatList
          horizontal
          data={members}
          keyExtractor={(item) => item.user_id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.membersList}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('Profile', {
                userId: item.user_id,
              })}
              style={({ pressed }) => [
                styles.member,
                pressed && styles.pressed,
              ]}
            >
              <Avatar
                size={52}
                name={item.display_name || 'Member'}
                uri={item.avatar_url}
              />
              <Text style={styles.memberName} numberOfLines={1}>
                {item.is_me ? 'You' : item.display_name || 'Member'}
              </Text>
            </Pressable>
          )}
        />
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setActiveTab('timeline')}
          style={[
            styles.tab,
            activeTab === 'timeline' && styles.activeTab,
          ]}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={activeTab === 'timeline' ? COLORS.text : COLORS.subtext}
          />
          <Text style={[
            styles.tabText,
            activeTab === 'timeline' && styles.activeTabText,
          ]}>
            Timeline
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('posts')}
          style={[
            styles.tab,
            activeTab === 'posts' && styles.activeTab,
          ]}
        >
          <Ionicons
            name="grid-outline"
            size={18}
            color={activeTab === 'posts' ? COLORS.text : COLORS.subtext}
          />
          <Text style={[
            styles.tabText,
            activeTab === 'posts' && styles.activeTabText,
          ]}>
            Posts
          </Text>
        </Pressable>
      </View>
    </>
  ) : null;

  if (loading && !conversation) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening Circle profile…</Text>
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

  const timelineData = activeTab === 'timeline' ? timeline : [];

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.contentWidth}>
        <FlatList
          data={timelineData}
          keyExtractor={(item) => item.id}
          numColumns={3}
          ListHeaderComponent={header}
          renderItem={({ item, index }) => (
            <TimelineTile
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
              <Ionicons
                name={activeTab === 'timeline'
                  ? 'images-outline'
                  : 'albums-outline'}
                size={38}
                color={COLORS.subtext}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === 'timeline'
                  ? 'No shared media yet'
                  : 'No Circle posts yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {activeTab === 'timeline'
                  ? 'Photos and videos sent in Chat will appear here automatically, without being uploaded twice.'
                  : 'Circle posts will be intentional posts made for this private shared profile. That separate post flow comes next.'}
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
    paddingTop: 22,
    paddingBottom: 18,
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
  bio: {
    maxWidth: 440,
    marginTop: 10,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  statsRow: {
    width: '100%',
    maxWidth: 400,
    flexDirection: 'row',
    marginTop: 19,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  statValue: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  statLabel: {
    marginTop: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  editButton: {
    width: '100%',
    maxWidth: 360,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f4f4f4',
  },
  editButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  membersStrip: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    paddingBottom: 11,
  },
  membersHeading: {
    marginLeft: 14,
    marginBottom: 9,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  membersList: {
    paddingHorizontal: 10,
  },
  member: {
    width: 72,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  memberName: {
    width: 70,
    marginTop: 5,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
    textAlign: 'center',
  },
  tabs: {
    height: 48,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: COLORS.text,
  },
  tabText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  activeTabText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  timelineTile: {
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: COLORS.bg,
    backgroundColor: '#ececec',
  },
  tileMedia: {
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
    maxWidth: 420,
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
