import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../../components/Avatar';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  getConversationDetails,
  listConversationTimeline,
  subscribeToConversationChanges,
} from '../../services/conversationService';
import {
  listCirclePosts,
  subscribeToCirclePostChanges,
} from '../../services/circlePostService';
import {
  listTwoPersonPlans,
  subscribeToTwoPersonPlanChanges,
} from '../../services/twoPersonPlanService';
import {
  listTwoPersonImportantDates,
  subscribeToTwoPersonImportantDateChanges,
} from '../../services/twoPersonImportantDateService';
import {
  listTwoPersonAlbums,
  subscribeToTwoPersonAlbumChanges,
} from '../../services/twoPersonAlbumService';
import { fetchCircleDecoration } from '../../services/circleDecorationService';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(255,255,255,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function Stat({ value, label, onPress, styles }) {
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

function TimelineTile({ item, size, onPress, styles }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.gridTile,
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
        <View style={styles.mediaBadge}>
          <Ionicons name="videocam" size={13} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

function PlanMemoryTile({ item, size, onPress, styles, theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.gridTile,
        styles.planMemoryTile,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.planMemoryIcon}>
        <Ionicons name="sparkles" size={21} color={theme.colors.text} />
      </View>
      <Text style={styles.planMemoryLabel}>PLAN MEMORY</Text>
      <Text style={styles.planMemoryTitle} numberOfLines={3}>{item.title}</Text>
      {item.completedAt ? (
        <Text style={styles.planMemoryDate} numberOfLines={1}>
          {new Date(item.completedAt).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      ) : null}
    </Pressable>
  );
}

function PostTile({ post, size, slotSize, onPress, styles }) {
  const firstMedia = post.media?.[0];

  return (
    <View style={[styles.postTileSlot, { width: slotSize, height: slotSize }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.postCircleTile,
          { width: size, height: size, borderRadius: size / 2 },
          pressed && styles.pressedCircle,
        ]}
      >
        {firstMedia?.mediaType === 'image' ? (
          <Image source={{ uri: firstMedia.url }} style={styles.tileMedia} resizeMode="cover" />
        ) : (
          <View style={styles.videoTile}>
            <Ionicons
              name={firstMedia ? 'play' : 'image-outline'}
              size={28}
              color="#fff"
            />
          </View>
        )}
      </Pressable>
    </View>
  );
}

function CircleProfileContent({ route, navigation }) {
  const { conversationId, initialTab = 'posts' } = route.params || {};
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [details, setDetails] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [posts, setPosts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [importantDates, setImportantDates] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [decoration, setDecoration] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialTab === 'timeline' || initialTab === 'posts') {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');

    try {
      const detailRows = await getConversationDetails(conversationId);
      const conversation = detailRows?.conversation;
      const hasCircle = conversation?.kind === 'group'
        || Boolean(conversation?.circle_enabled);

      if (!hasCircle) {
        throw new Error('This direct chat has no Circle profile.');
      }

      setDetails(detailRows);

      if (
        conversation?.kind === 'direct'
        && !conversation?.circle_access_active
      ) {
        setTimeline([]);
        setPosts([]);
        setPlans([]);
        setImportantDates([]);
        setAlbums([]);
        setDecoration(null);
        return;
      }

      const [timelineRows, postRows, decorationRows] = await Promise.all([
        listConversationTimeline(conversationId),
        listCirclePosts(conversationId),
        fetchCircleDecoration(conversationId).catch(() => null),
      ]);

      setDecoration(decorationRows);

      let planRows = [];
      let importantDateRows = [];
      let albumRows = [];
      if (conversation?.kind === 'direct') {
        try {
          planRows = await listTwoPersonPlans(conversationId);
        } catch {
          // The Circle remains usable if the plans migration is not installed yet.
          planRows = [];
        }
        try {
          importantDateRows = await listTwoPersonImportantDates(conversationId);
        } catch {
          // The Circle remains usable until the important-dates migration is installed.
          importantDateRows = [];
        }
        try {
          albumRows = await listTwoPersonAlbums(conversationId);
        } catch {
          // The Circle remains usable until the albums migration is installed.
          albumRows = [];
        }
      }

      setTimeline(timelineRows);
      setPosts(postRows);
      setPlans(planRows);
      setImportantDates(importantDateRows);
      setAlbums(albumRows);
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

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      return subscribeToCirclePostChanges({
        conversationId,
        onChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      return subscribeToTwoPersonPlanChanges({
        conversationId,
        onChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      return subscribeToTwoPersonImportantDateChanges({
        conversationId,
        onChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      return subscribeToTwoPersonAlbumChanges({
        conversationId,
        onChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  const conversation = details?.conversation;
  const members = details?.members || [];
  const isTwoPersonCircle = conversation?.kind === 'direct';
  const circleLocked = isTwoPersonCircle
    && !conversation?.circle_access_active;
  const decorationActive = Boolean(
    decoration?.circle_header_url
    || decoration?.circle_background_url
    || decoration?.circle_background_color
  );
  const hasHeaderPhoto = Boolean(decoration?.circle_header_url);
  const gridWidth = Math.min(width, 720);
  const tileSize = Math.floor(gridWidth / 3);
  const postCircleSize = Math.max(72, tileSize - 14);
  const completedPlans = plans.filter((plan) => plan.status === 'completed');
  const timelineItems = [
    ...timeline.map((item) => ({ ...item, kind: 'media' })),
    ...completedPlans.map((plan) => ({
      ...plan,
      id: `plan-memory-${plan.id}`,
      planId: plan.id,
      kind: 'plan_memory',
      createdAt: plan.completedAt || plan.updatedAt,
    })),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const createPost = () => {
    setActiveTab('posts');
    navigation.navigate('CreateCirclePost', {
      conversationId,
      circleName: conversation?.title || 'Circle',
    });
  };

  const openPeople = () => {
    navigation.navigate('CirclePeople', {
      conversationId,
      circleName: conversation?.title || 'Circle',
    });
  };

  const openEvents = () => {
    navigation.navigate('CircleEvents', {
      conversationId,
      circleName: conversation?.title || 'Circle',
    });
  };

  const openPlans = () => {
    navigation.navigate('TwoPersonPlans', {
      conversationId,
      circleName: conversation?.title || 'Our Circle',
    });
  };

  const openImportantDates = () => {
    navigation.navigate('TwoPersonImportantDates', {
      conversationId,
      circleName: conversation?.title || 'Our Circle',
    });
  };

  const openAlbums = () => {
    navigation.navigate('TwoPersonAlbums', {
      conversationId,
      circleName: conversation?.title || 'Our Circle',
    });
  };

  const openMore = () => {
    navigation.navigate('CircleMore', {
      conversationId,
      circleName: conversation?.title || (isTwoPersonCircle ? 'Our Circle' : 'Circle'),
    });
  };

  const header = conversation ? (
    <>
      <View style={[
        styles.profileHeader,
        decorationActive && styles.decoratedProfileHeader,
      ]}>
        {hasHeaderPhoto ? (
          <View
            style={[
              styles.sharedHeaderPhotoWrap,
              { height: 108 + insets.top },
            ]}
          >
            <Image
              source={{ uri: decoration.circle_header_url }}
              resizeMode="cover"
              style={styles.sharedHeaderPhoto}
            />
            <View style={styles.sharedHeaderPhotoTint} />
          </View>
        ) : (
          <View style={{ height: insets.top + 42 }} />
        )}

        <View style={[styles.avatarOverlap, hasHeaderPhoto && styles.avatarWithHeader]}>
          <Avatar
            size={84}
            name={conversation.title}
            uri={conversation.avatar_url}
          />
        </View>

        <Text style={styles.title}>{conversation.title}</Text>

        {isTwoPersonCircle ? (
          conversation.silent_message ? (
            <View style={styles.silentMessageCard}>
              <View style={styles.silentMessageHeading}>
                <Ionicons name="moon-outline" size={14} color={theme.colors.text} />
                <Text style={styles.silentMessageLabel}>
                  A quiet message from {conversation.silent_message_author || 'them'}
                </Text>
              </View>
              <Text style={styles.silentMessageText}>
                {conversation.silent_message}
              </Text>
            </View>
          ) : null
        ) : conversation.bio ? (
          <Text style={styles.bio} numberOfLines={2}>
            {conversation.bio}
          </Text>
        ) : null}

        <View style={styles.statsRow}>
          <Stat
            value={Number(conversation.post_count || posts.length)}
            label="Posts"
            onPress={() => setActiveTab('posts')}
            styles={styles}
          />
          {isTwoPersonCircle ? (
            <Stat
              value={plans.length}
              label="Plans"
              onPress={openPlans}
              styles={styles}
            />
          ) : null}
          {isTwoPersonCircle ? (
            <Stat
              value={importantDates.length}
              label="Dates"
              onPress={openImportantDates}
              styles={styles}
            />
          ) : null}
          {isTwoPersonCircle ? (
            <Stat
              value={albums.length}
              label="Albums"
              onPress={openAlbums}
              styles={styles}
            />
          ) : null}
          <Stat
            value={Number(conversation.timeline_count || timeline.length) + completedPlans.length}
            label="Timeline"
            onPress={() => setActiveTab('timeline')}
            styles={styles}
          />
          {!isTwoPersonCircle ? (
            <Stat
              value={members.length}
              label="People"
              onPress={openPeople}
              styles={styles}
            />
          ) : null}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={createPost}
            style={({ pressed }) => [
              styles.primaryAction,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={17} color={theme.welcome.brandInk} />
            <Text style={styles.primaryActionText}>New Post</Text>
          </Pressable>

          {!isTwoPersonCircle ? (
            <Pressable
              onPress={openEvents}
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="calendar-outline" size={16} color={theme.colors.text} />
              <Text style={styles.secondaryActionText}>Plans</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={openMore}
            style={({ pressed }) => [
              styles.secondaryAction,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="ellipsis-horizontal" size={17} color={theme.colors.text} />
            <Text style={styles.secondaryActionText}>More</Text>
          </Pressable>
        </View>
      </View>

      {!isTwoPersonCircle ? (
        <View style={styles.membersStrip}>
          <View style={styles.membersHeadingRow}>
            <Text style={styles.membersHeading}>People</Text>
            <Pressable
              onPress={openPeople}
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          </View>
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
                  size={48}
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
      ) : null}

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setActiveTab('posts')}
          style={styles.tab}
        >
          <Ionicons
            name="grid-outline"
            size={18}
            color={activeTab === 'posts' ? theme.colors.text : theme.colors.subtext}
          />
          <Text style={[
            styles.tabText,
            activeTab === 'posts' && styles.activeTabText,
          ]}>
            Posts
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('timeline')}
          style={styles.tab}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={activeTab === 'timeline' ? theme.colors.text : theme.colors.subtext}
          />
          <Text style={[
            styles.tabText,
            activeTab === 'timeline' && styles.activeTabText,
          ]}>
            Timeline
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
        <Ionicons name="lock-closed-outline" size={36} color={theme.colors.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (circleLocked) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.lockedScreen}>
        <View style={styles.lockedIcon}>
          <Ionicons name="lock-closed" size={28} color={theme.colors.text} />
        </View>
        <Text style={styles.lockedTitle}>Our Circle is closed</Text>
        <Text style={styles.lockedBody}>
          Your shared history is preserved, but neither person can open it right now. It can reopen only after fresh Mutual Interest, fresh Mutual Focus, and a new mutual decision.
        </Text>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.lockedButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.lockedButtonText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const gridData = activeTab === 'timeline' ? timelineItems : posts;

  return (
    <SafeAreaView
      edges={['bottom']}
      style={[styles.screen, decorationActive && styles.decoratedScreen]}
    >
      {decoration?.circle_background_url ? (
        <ImageBackground
          source={{ uri: decoration.circle_background_url }}
          resizeMode="cover"
          style={styles.backgroundLayer}
        >
          <View style={styles.backgroundTint} />
        </ImageBackground>
      ) : decoration?.circle_background_color ? (
        <View
          style={[
            styles.backgroundLayer,
            { backgroundColor: decoration.circle_background_color },
          ]}
        />
      ) : null}
      <View
        pointerEvents="box-none"
        style={[styles.floatingTopBar, { paddingTop: insets.top }]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [
            styles.floatingBackButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
      </View>
      <View style={styles.contentWidth}>
        <FlatList
          data={gridData}
          keyExtractor={(item) => item.id}
          numColumns={3}
          ListHeaderComponent={header}
          renderItem={({ item, index }) => (
            activeTab === 'timeline' ? (
              item.kind === 'plan_memory' ? (
                <PlanMemoryTile
                  item={item}
                  size={tileSize}
                  onPress={() => navigation.navigate('TwoPersonPlanDetail', {
                    planId: item.planId,
                    conversationId,
                    circleName: conversation?.title || 'Our Circle',
                  })}
                  styles={styles}
                  theme={theme}
                />
              ) : (
                <TimelineTile
                  item={item}
                  size={tileSize}
                  onPress={() => navigation.navigate('CircleTimelineFeed', {
                    conversationId,
                    initialMediaId: item.id,
                    circleName: conversation?.title || 'Circle',
                  })}
                  styles={styles}
                />
              )
            ) : (
              <PostTile
                post={item}
                size={postCircleSize}
                slotSize={tileSize}
                onPress={() => navigation.navigate('CirclePostsFeed', {
                  conversationId,
                  initialPostId: item.id,
                  circleName: conversation?.title || 'Circle',
                })}
                styles={styles}
              />
            )
          )}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Ionicons
                name={activeTab === 'timeline'
                  ? 'images-outline'
                  : 'albums-outline'}
                size={38}
                color={theme.colors.subtext}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === 'timeline'
                  ? 'No shared media yet'
                  : 'No Circle posts yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {activeTab === 'timeline'
                  ? 'Photos and videos sent in Chat will appear here automatically, without being uploaded twice.'
                  : 'Posts are intentional moments created for this private Circle. They stay separate from the automatic chat Timeline.'}
              </Text>
              {activeTab === 'posts' ? (
                <Pressable
                  onPress={createPost}
                  style={({ pressed }) => [
                    styles.emptyButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.emptyButtonText}>Create First Post</Text>
                </Pressable>
              ) : null}
            </View>
          )}
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
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

export function CircleProfileScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CircleProfileContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.circle.profileBackground,
  },
  decoratedScreen: {
    backgroundColor: 'transparent',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  floatingTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    minHeight: 48,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  floatingBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  contentWidth: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 44,
  },
  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  decoratedProfileHeader: {
    backgroundColor: rgba(theme.circle.accentSoft, 0.76),
  },
  decal: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.15,
  },
  decalOne: {
    width: 116,
    height: 116,
    top: -54,
    right: -26,
  },
  decalTwo: {
    width: 64,
    height: 64,
    top: 98,
    left: -28,
  },
  decalThree: {
    width: 78,
    height: 78,
    bottom: -42,
    right: 54,
  },
  sharedHeaderPhotoWrap: {
    overflow: 'hidden',
    alignSelf: 'stretch',
    marginHorizontal: -18,
    marginBottom: -34,
    backgroundColor: 'transparent',
  },
  sharedHeaderPhoto: {
    width: '100%',
    height: '100%',
  },
  sharedHeaderPhotoTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,18,34,0.05)',
  },
  avatarOverlap: {
    zIndex: 2,
    padding: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  avatarWithHeader: {
    marginTop: 0,
  },
  title: {
    marginTop: 7,
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 21,
    textAlign: 'center',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  privacyText: {
    color: theme.colors.subtext,
    fontFamily: theme.typography.semibold,
    fontSize: 11,
  },
  planMemoryTile: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: theme.circle.accentSoft,
  },
  planMemoryIcon: {
    width: 31,
    height: 31,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  planMemoryLabel: {
    marginTop: 7,
    color: theme.colors.subtext,
    fontFamily: theme.typography.bold,
    fontSize: 8.5,
    letterSpacing: 0.6,
  },
  planMemoryTitle: {
    flex: 1,
    marginTop: 4,
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 12,
    lineHeight: 16,
  },
  planMemoryDate: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: theme.typography.semibold,
    fontSize: 9.5,
  },
  silentMessageCard: {
    width: '100%',
    maxWidth: 440,
    marginTop: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  silentMessageHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  silentMessageLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 11.5,
  },
  silentMessageText: {
    marginTop: 7,
    color: theme.colors.text,
    fontFamily: theme.typography.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  bio: {
    maxWidth: 440,
    marginTop: 5,
    color: theme.colors.text,
    fontFamily: theme.typography.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  statsRow: {
    width: '100%',
    maxWidth: 400,
    flexDirection: 'row',
    marginTop: 10,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  statValue: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 16,
  },
  statLabel: {
    marginTop: 1,
    color: theme.colors.subtext,
    fontFamily: theme.typography.regular,
    fontSize: 11,
  },
  actionRow: {
    width: '100%',
    maxWidth: 390,
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  primaryAction: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    backgroundColor: theme.circle.accent,
  },
  primaryActionText: {
    color: theme.welcome.brandInk,
    fontFamily: theme.typography.bold,
    fontSize: 13,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  secondaryActionText: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 13,
  },
  membersStrip: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderTopColor: 'transparent',
    paddingTop: 7,
    paddingBottom: 8,
  },
  membersHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginBottom: 7,
  },
  membersHeading: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 13,
  },
  seeAllText: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 12,
  },
  membersList: {
    paddingHorizontal: 10,
  },
  member: {
    width: 68,
    alignItems: 'center',
    marginHorizontal: 1,
  },
  memberName: {
    width: 66,
    marginTop: 4,
    color: theme.colors.text,
    fontFamily: theme.typography.semibold,
    fontSize: 10,
    textAlign: 'center',
  },
  tabs: {
    height: 42,
    flexDirection: 'row',
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabText: {
    color: theme.colors.subtext,
    fontFamily: theme.typography.semibold,
    fontSize: 12,
  },
  activeTabText: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
  },
  postTileSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  postCircleTile: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surfaceSoft,
  },
  pressedCircle: {
    opacity: 0.86,
    transform: [{ scale: 0.975 }],
  },
  gridTile: {
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: theme.circle.profileBackground,
    backgroundColor: theme.colors.surfaceSoft,
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
  mediaBadge: {
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
  multiBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
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
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 16,
  },
  emptyBody: {
    maxWidth: 420,
    marginTop: 6,
    color: theme.colors.subtext,
    fontFamily: theme.typography.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: theme.circle.accent,
  },
  emptyButtonText: {
    color: theme.welcome.brandInk,
    fontFamily: theme.typography.bold,
    fontSize: 13,
  },
  lockedScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    backgroundColor: theme.circle.profileBackground,
  },
  lockedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  lockedTitle: {
    marginTop: 18,
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 20,
    textAlign: 'center',
  },
  lockedBody: {
    maxWidth: 430,
    marginTop: 9,
    color: theme.colors.subtext,
    fontFamily: theme.typography.regular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  lockedButton: {
    minWidth: 150,
    minHeight: 44,
    marginTop: 22,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accent,
  },
  lockedButtonText: {
    color: theme.welcome.brandInk,
    fontFamily: theme.typography.bold,
    fontSize: 13,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: theme.circle.profileBackground,
  },
  stateText: {
    marginTop: 10,
    color: theme.colors.subtext,
    fontFamily: theme.typography.regular,
  },
  errorText: {
    marginTop: 12,
    color: theme.colors.text,
    fontFamily: theme.typography.semibold,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: theme.circle.accent,
  },
  retryText: {
    color: theme.welcome.brandInk,
    fontFamily: theme.typography.bold,
  },
  pressed: {
    opacity: 0.7,
  },
  });
}
