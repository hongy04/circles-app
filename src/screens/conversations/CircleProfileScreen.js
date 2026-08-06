import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { StickerCanvas } from '../../components/decorations/StickerCanvas';
import { EventAlbumMemoryCover } from '../../components/events/EventAlbumMemoryCover';
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
import {
  listTwoPersonThoughts,
  subscribeToTwoPersonThoughtChanges,
} from '../../services/twoPersonThoughtService';
import { fetchCircleDecoration } from '../../services/circleDecorationService';
import { listCircleEventMemories } from '../../services/eventService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(255,255,255,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function importantDateHasHappened(dateValue) {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const moment = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (Number.isNaN(moment.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return moment <= today;
}

function formatImportantDateTile(dateValue) {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { month: 'DATE', day: '—' };
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return {
    month: date.toLocaleDateString([], { month: 'short' }).toUpperCase(),
    day: String(date.getDate()),
  };
}

function preserveDecorationImageUrls(current, next) {
  if (!next || !current) return next;

  const currentAssets = new Map(
    (current.circle_custom_stickers || []).map((asset) => [String(asset?.id || ''), asset])
  );

  return {
    ...next,
    circle_header_url:
      current.circle_header_path
      && current.circle_header_path === next.circle_header_path
        ? current.circle_header_url
        : next.circle_header_url,
    circle_background_url:
      current.circle_background_path
      && current.circle_background_path === next.circle_background_path
        ? current.circle_background_url
        : next.circle_background_url,
    circle_custom_stickers: (next.circle_custom_stickers || []).map((asset) => {
      const previous = currentAssets.get(String(asset?.id || ''));
      if (previous?.path && previous.path === asset?.path && previous.url) {
        return { ...asset, url: previous.url };
      }
      return asset;
    }),
  };
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

function ImportantDateMemoryTile({ item, size, onPress, styles, theme }) {
  const dateParts = formatImportantDateTile(item.dateValue);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.gridTile,
        styles.importantDateMemoryTile,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.importantDateGlowOne} />
      <View style={styles.importantDateGlowTwo} />
      <Text style={styles.importantDateMonth}>{dateParts.month}</Text>
      <Text style={styles.importantDateDay}>{dateParts.day}</Text>
      <View style={styles.importantDateTileBottom}>
        <Text style={styles.importantDateTileLabel}>MILESTONE</Text>
        <Text style={styles.importantDateTileTitle} numberOfLines={2}>{item.title}</Text>
      </View>
      <Ionicons name="heart-outline" size={15} color={theme.colors.text} style={styles.importantDateTileIcon} />
    </Pressable>
  );
}

function SharedThoughtMemoryTile({ item, size, onPress, styles, theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.gridTile,
        styles.sharedThoughtMemoryTile,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.sharedThoughtQuoteIcon}>
        <Ionicons name="chatbubble-ellipses-outline" size={17} color={theme.colors.text} />
      </View>
      <Text style={styles.sharedThoughtTileLabel}>SHARED NOTE</Text>
      <Text style={styles.sharedThoughtTileTitle} numberOfLines={2}>
        {item.title || 'A shared thought'}
      </Text>
      <Text style={styles.sharedThoughtTileExcerpt} numberOfLines={4}>{item.body}</Text>
    </Pressable>
  );
}

function EventMemoryTile({ item, size, onPress, styles }) {
  const memoryPeople = item.attendanceReviewedAt
    ? Number(item.attendedCount || 0)
    : Number(item.goingCount || 0);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.gridTile,
        styles.eventMemoryTile,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
    >
      <EventAlbumMemoryCover
        appearanceKey={item.appearanceKey || 'circle'}
        coverUri={item.coverUrl || null}
        previewUrls={item.previewUrls || []}
        height={size}
        borderRadius={0}
        style={styles.eventMemoryArtwork}
      >
        <View style={styles.eventMemoryShade}>
          <View style={styles.eventMemoryBadge}>
            <Ionicons name="sparkles" size={10} color="#fff" />
            <Text style={styles.eventMemoryBadgeText}>EVENT</Text>
          </View>
          <View>
            <Text style={styles.eventMemoryTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.eventMemoryMeta} numberOfLines={1}>
              {memoryPeople} there
              {Number(item.photoCount || 0) > 0 ? ` · ${item.photoCount} photos` : ''}
            </Text>
          </View>
        </View>
      </EventAlbumMemoryCover>
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
  // Conversation details are only a warm identity shell. Chat and other
  // screens may already know the Circle name/members without having loaded the
  // Circle profile's posts, timeline, relationship-depth data, or decoration.
  // Keep those concepts separate so a cached identity can never suppress the
  // profile's first authoritative hydration.
  const cachedDetails = readNavigationCache(navigationCacheKeys.conversationDetails(conversationId));
  const cachedTimeline = readNavigationCache(navigationCacheKeys.circleTimeline(conversationId));
  const cachedPosts = readNavigationCache(navigationCacheKeys.circlePosts(conversationId));
  const cachedPlans = readNavigationCache(navigationCacheKeys.twoPersonPlans(conversationId));
  const cachedImportantDates = readNavigationCache(navigationCacheKeys.twoPersonDates(conversationId));
  const cachedThoughts = readNavigationCache(navigationCacheKeys.twoPersonThoughts(conversationId));
  const cachedAlbums = readNavigationCache(navigationCacheKeys.twoPersonAlbums(conversationId));
  const cachedDecoration = readNavigationCache(navigationCacheKeys.circleDecoration(conversationId));
  const cachedEventMemories = readNavigationCache(navigationCacheKeys.circleEventMemories(conversationId));
  const hasWarmGridSnapshot = Array.isArray(cachedTimeline) && Array.isArray(cachedPosts);

  const [details, setDetails] = useState(cachedDetails || null);
  const [timeline, setTimeline] = useState(Array.isArray(cachedTimeline) ? cachedTimeline : []);
  const [posts, setPosts] = useState(Array.isArray(cachedPosts) ? cachedPosts : []);
  const [plans, setPlans] = useState(Array.isArray(cachedPlans) ? cachedPlans : []);
  const [importantDates, setImportantDates] = useState(
    Array.isArray(cachedImportantDates) ? cachedImportantDates : []
  );
  const [thoughts, setThoughts] = useState(Array.isArray(cachedThoughts) ? cachedThoughts : []);
  const [albums, setAlbums] = useState(Array.isArray(cachedAlbums) ? cachedAlbums : []);
  const [decoration, setDecoration] = useState(cachedDecoration || null);
  const [eventMemories, setEventMemories] = useState(Array.isArray(cachedEventMemories) ? cachedEventMemories : []);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(!cachedDetails);
  const [contentResolved, setContentResolved] = useState(hasWarmGridSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // This means the Circle PROFILE has hydrated, not merely that another screen
  // cached the conversation identity. It intentionally starts false on mount.
  const hasLoadedRef = useRef(false);
  const lastLoadedAtRef = useRef(0);
  const hadWarmIdentityRef = useRef(Boolean(cachedDetails));
  const eventMemoryLoadedAtRef = useRef(Array.isArray(cachedEventMemories) ? Date.now() : 0);
  const eventMemoryInFlightRef = useRef(null);

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
      // Circle identity, posts/timeline, and decoration are independent reads.
      // Starting them together removes an entire network round trip from a
      // cold Circle open instead of waiting for identity before asking for the
      // content we already know this route will need.
      const detailPromise = getConversationDetails(conversationId);
      const coreContentPromise = Promise.all([
        listConversationTimeline(conversationId),
        listCirclePosts(conversationId),
        fetchCircleDecoration(conversationId).catch(() => null),
      ]);

      const detailRows = await detailPromise;
      const conversation = detailRows?.conversation;
      const hasCircle = conversation?.kind === 'group'
        || Boolean(conversation?.circle_enabled);

      if (!hasCircle) {
        throw new Error('This direct chat has no Circle profile.');
      }

      setDetails(detailRows);
      writeNavigationCache(navigationCacheKeys.conversationDetails(conversationId), detailRows);

      // The Circle profile already has enough identity/member context to make
      // the People destination feel immediate. Permissions and pending invites
      // are intentionally conservative until CirclePeople quietly hydrates its
      // authoritative payload.
      if (conversation?.kind === 'group') {
        const existingPeople = readNavigationCache(navigationCacheKeys.circlePeople(conversationId));
        if (!existingPeople || existingPeople.isPreview) {
          const memberPreview = (detailRows?.members || []).map((member) => ({
            userId: member.user_id,
            displayName: member.display_name || 'Member',
            avatarUri: member.avatar_url || null,
            role: member.role || 'member',
            joinedAt: member.joined_at || null,
            isMe: Boolean(member.is_me),
          }));
          writeNavigationCache(navigationCacheKeys.circlePeople(conversationId), {
            conversation: {
              id: conversation.id || conversationId,
              title: conversation.title || 'Circle',
              avatarUri: conversation.avatar_url || null,
              memberCount: memberPreview.length,
              pendingCount: 0,
            },
            viewerRole: 'member',
            permissions: {
              canInvite: false,
              canCancelInvitations: false,
              canManageRoles: false,
              canRemoveMembers: false,
              canLeave: false,
            },
            members: memberPreview,
            pendingInvitations: [],
            isPreview: true,
          });
        }
      }

      if (
        conversation?.kind === 'direct'
        && !conversation?.circle_access_active
      ) {
        // Consume the already-started promise so a denied/locked secondary
        // read can never surface later as an unhandled rejection.
        await coreContentPromise.catch(() => null);
        setTimeline([]);
        setPosts([]);
        setPlans([]);
        setImportantDates([]);
        setThoughts([]);
        setAlbums([]);
        setDecoration(null);
        return;
      }

      const [timelineRows, postRows, decorationRows] = await coreContentPromise;

      setDecoration((current) => preserveDecorationImageUrls(current, decorationRows));
      if (decorationRows) {
        writeNavigationCache(navigationCacheKeys.circleDecoration(conversationId), decorationRows);
      }

      // Core Circle content should become interactive as soon as it is ready.
      // Relationship-depth modules (plans/dates/albums/thoughts) are useful, but
      // they must not hold posts or timeline hostage on Our Circle.
      setTimeline(timelineRows);
      setPosts(postRows);
      writeNavigationCache(navigationCacheKeys.circleTimeline(conversationId), timelineRows);
      writeNavigationCache(navigationCacheKeys.circlePosts(conversationId), postRows);
      postRows.forEach((post) => {
        writeNavigationCache(navigationCacheKeys.circlePost(post.id), post);
      });
      setContentResolved(true);
      setLoading(false);

      if (conversation?.kind === 'direct') {
        const [plansResult, datesResult, albumsResult, thoughtsResult] = await Promise.allSettled([
          listTwoPersonPlans(conversationId),
          listTwoPersonImportantDates(conversationId),
          listTwoPersonAlbums(conversationId),
          listTwoPersonThoughts(conversationId),
        ]);
        // Optional relationship-depth modules must never block the Circle itself.
        const planRows = plansResult.status === 'fulfilled' ? plansResult.value : [];
        const importantDateRows = datesResult.status === 'fulfilled' ? datesResult.value : [];
        const albumRows = albumsResult.status === 'fulfilled' ? albumsResult.value : [];
        const thoughtRows = thoughtsResult.status === 'fulfilled' ? thoughtsResult.value : [];

        setPlans(planRows);
        setImportantDates(importantDateRows);
        setThoughts(thoughtRows);
        setAlbums(albumRows);
        writeNavigationCache(navigationCacheKeys.twoPersonPlans(conversationId), planRows);
        writeNavigationCache(navigationCacheKeys.twoPersonDates(conversationId), importantDateRows);
        writeNavigationCache(navigationCacheKeys.twoPersonAlbums(conversationId), albumRows);
        writeNavigationCache(navigationCacheKeys.twoPersonThoughts(conversationId), thoughtRows);
        planRows.forEach((plan) => {
          writeNavigationCache(navigationCacheKeys.plan(plan.id), plan);
        });
        albumRows.forEach((album) => {
          writeNavigationCache(navigationCacheKeys.album(album.id), album);
        });
        thoughtRows.forEach((thought) => {
          writeNavigationCache(navigationCacheKeys.thought(thought.id), thought);
        });
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this private Circle.');
    } finally {
      lastLoadedAtRef.current = Date.now();
      setContentResolved(true);
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  const loadEventMemories = useCallback(async ({ force = false } = {}) => {
    if (!conversationId) return [];
    if (!force && Date.now() - eventMemoryLoadedAtRef.current < 20_000) {
      return eventMemories;
    }
    if (eventMemoryInFlightRef.current) return eventMemoryInFlightRef.current;

    const request = (async () => {
      try {
        const rows = await listCircleEventMemories(conversationId, { includeTimelineMedia: false });
        setEventMemories(rows);
        writeNavigationCache(navigationCacheKeys.circleEventMemories(conversationId), rows);
        rows.forEach((event) => {
          writeNavigationCache(navigationCacheKeys.eventSummary(event.id), event);
        });
        eventMemoryLoadedAtRef.current = Date.now();
        return rows;
      } catch {
        // Event memories are an additive history layer. The Circle profile and
        // chat-media Timeline remain fully usable if events are disabled or a
        // staged backend migration has not landed yet.
        return [];
      } finally {
        eventMemoryInFlightRef.current = null;
      }
    })();

    eventMemoryInFlightRef.current = request;
    return request;
  }, [conversationId, eventMemories]);

  useFocusEffect(
    useCallback(() => {
      const warmMemories = readNavigationCache(navigationCacheKeys.circleEventMemories(conversationId));
      if (Array.isArray(warmMemories)) setEventMemories(warmMemories);
      const hasLoaded = hasLoadedRef.current;
      const recentlyLoaded = hasLoaded
        && Date.now() - lastLoadedAtRef.current < 20_000;

      // Back-navigation should reveal the exact Circle profile that was already
      // on screen. A short child-page visit is not a reason to refetch the
      // profile, decorations, posts, and memories again. Longer absences still
      // get a quiet revalidation.
      if (recentlyLoaded) return undefined;

      // A cached conversation identity is useful for immediate paint, but it is
      // NOT proof that Circle Profile content has ever loaded. On the first
      // focus we always hydrate. If identity is warm, do it quietly around the
      // visible shell instead of replacing that shell with a loading screen.
      const quiet = hasLoaded || hadWarmIdentityRef.current;
      void load({ quiet }).finally(() => {
        hasLoadedRef.current = true;
      });
      return undefined;
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

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      return subscribeToTwoPersonThoughtChanges({
        conversationId,
        onChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  const conversation = details?.conversation;
  const members = details?.members || [];

  useEffect(() => {
    if (activeTab !== 'timeline' || conversation?.kind !== 'group') return;
    void loadEventMemories();
  }, [activeTab, conversation?.kind, loadEventMemories]);
  const isTwoPersonCircle = conversation?.kind === 'direct';
  const circleLocked = isTwoPersonCircle
    && !conversation?.circle_access_active;
  const decorationActive = Boolean(
    decoration?.circle_header_url
    || decoration?.circle_background_url
    || decoration?.circle_background_color
    || decoration?.circle_stickers?.length
  );
  const hasHeaderPhoto = Boolean(decoration?.circle_header_url);
  const gridWidth = Math.min(width, 720);
  const tileSize = Math.floor(gridWidth / 3);
  const postCircleSize = Math.max(72, tileSize - 14);
  const completedPlans = plans.filter((plan) => plan.status === 'completed');
  const milestoneDates = importantDates.filter((item) => importantDateHasHappened(item.dateValue));
  const sharedThoughts = thoughts.filter((item) => item.status === 'shared');
  const timelineItems = [
    ...timeline.map((item) => ({ ...item, kind: 'media' })),
    ...completedPlans.map((plan) => ({
      ...plan,
      id: `plan-memory-${plan.id}`,
      planId: plan.id,
      kind: 'plan_memory',
      createdAt: plan.completedAt || plan.updatedAt,
    })),
    ...eventMemories.map((event) => ({
      ...event,
      id: `event-memory-${event.id}`,
      eventId: event.id,
      kind: 'event_memory',
      createdAt: event.completedAt || event.endsAt || event.startsAt,
    })),
    ...milestoneDates.map((item) => ({
      ...item,
      id: `important-date-memory-${item.id}`,
      importantDateId: item.id,
      kind: 'important_date_memory',
      createdAt: item.dateValue,
    })),
    ...sharedThoughts.map((item) => ({
      ...item,
      id: `thought-memory-${item.id}`,
      thoughtId: item.id,
      kind: 'thought_memory',
      createdAt: item.sharedAt || item.updatedAt,
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
            value={Number(conversation.timeline_count || timeline.length)
              + completedPlans.length
              + eventMemories.length
              + milestoneDates.length
              + sharedThoughts.length}
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
        <View style={[styles.membersStrip, decorationActive && styles.decoratedMembersStrip]}>
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

      <View style={[styles.tabs, decorationActive && styles.decoratedTabs]}>
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
      <StickerCanvas stickers={decoration?.circle_stickers} customStickers={decoration?.circle_custom_stickers} style={styles.stickerLayer} />
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
              item.kind === 'event_memory' ? (
                <EventMemoryTile
                  item={item}
                  size={tileSize}
                  onPress={() => {
                    const summary = { ...item, id: item.eventId };
                    writeNavigationCache(navigationCacheKeys.eventSummary(item.eventId), summary);
                    navigation.navigate('CircleTimelineFeed', {
                      conversationId,
                      circleName: conversation?.title || 'Circle',
                      initialEventId: item.eventId,
                    });
                  }}
                  styles={styles}
                />
              ) : item.kind === 'plan_memory' ? (
                <PlanMemoryTile
                  item={item}
                  size={tileSize}
                  onPress={() => navigation.navigate('CircleTimelineFeed', {
                    conversationId,
                    circleName: conversation?.title || 'Our Circle',
                    isTwoPersonCircle: true,
                    initialPlanId: item.planId,
                  })}
                  styles={styles}
                  theme={theme}
                />
              ) : item.kind === 'important_date_memory' ? (
                <ImportantDateMemoryTile
                  item={item}
                  size={tileSize}
                  onPress={() => navigation.navigate('CircleTimelineFeed', {
                    conversationId,
                    circleName: conversation?.title || 'Our Circle',
                    isTwoPersonCircle: true,
                    initialImportantDateId: item.importantDateId,
                  })}
                  styles={styles}
                  theme={theme}
                />
              ) : item.kind === 'thought_memory' ? (
                <SharedThoughtMemoryTile
                  item={item}
                  size={tileSize}
                  onPress={() => navigation.navigate('CircleTimelineFeed', {
                    conversationId,
                    circleName: conversation?.title || 'Our Circle',
                    isTwoPersonCircle: true,
                    initialThoughtId: item.thoughtId,
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
                    isTwoPersonCircle,
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
            !contentResolved ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={theme.circle.accent} />
                <Text style={styles.emptyTitle}>
                  {activeTab === 'timeline' ? 'Loading timeline…' : 'Loading Circle posts…'}
                </Text>
                <Text style={styles.emptyBody}>
                  Your Circle is already open. We’re filling in its latest content quietly.
                </Text>
              </View>
            ) : (
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
                    ? 'No memories yet'
                    : 'No Circle posts yet'}
                </Text>
                <Text style={styles.emptyBody}>
                  {activeTab === 'timeline'
                    ? 'Shared media, completed plans, milestones, notes, and gatherings will collect here as your Circle history grows.'
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
            )
          )}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load({ quiet: true });
                if (activeTab === 'timeline' && conversation?.kind === 'group') {
                  void loadEventMemories({ force: true });
                }
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
  stickerLayer: {
    zIndex: 1,
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
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.86)',
    shadowColor: '#0A1222',
    shadowOpacity: 0.10,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  contentWidth: {
    flex: 1,
    width: '100%',
    zIndex: 2,
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
    backgroundColor: rgba(theme.circle.accentSoft, 0.62),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.64)',
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
  importantDateMemoryTile: {
    padding: 10,
    overflow: 'hidden',
    backgroundColor: rgba(theme.circle.accentSoft, 0.92),
  },
  importantDateGlowOne: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
    right: -22,
    top: -18,
    backgroundColor: rgba(theme.circle.accent, 0.14),
  },
  importantDateGlowTwo: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    right: 18,
    top: 24,
    borderWidth: 1.5,
    borderColor: rgba(theme.circle.accent, 0.22),
  },
  importantDateMonth: {
    color: theme.colors.subtext,
    fontFamily: theme.typography.bold,
    fontSize: 9,
    letterSpacing: 1.15,
  },
  importantDateDay: {
    marginTop: -2,
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 34,
    lineHeight: 39,
  },
  importantDateTileBottom: { marginTop: 'auto' },
  importantDateTileLabel: {
    color: theme.colors.subtext,
    fontFamily: theme.typography.bold,
    fontSize: 8,
    letterSpacing: 0.7,
  },
  importantDateTileTitle: {
    marginTop: 3,
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 11.5,
    lineHeight: 15,
  },
  importantDateTileIcon: { position: 'absolute', right: 10, bottom: 10, opacity: 0.72 },
  sharedThoughtMemoryTile: {
    padding: 10,
    backgroundColor: rgba(theme.colors.surface, 0.90),
    borderColor: rgba(theme.circle.accent, 0.22),
  },
  sharedThoughtQuoteIcon: {
    width: 29,
    height: 29,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: rgba(theme.circle.accentSoft, 0.86),
  },
  sharedThoughtTileLabel: {
    marginTop: 8,
    color: theme.colors.subtext,
    fontFamily: theme.typography.bold,
    fontSize: 8,
    letterSpacing: 0.7,
  },
  sharedThoughtTileTitle: {
    marginTop: 3,
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 11.5,
    lineHeight: 15,
  },
  sharedThoughtTileExcerpt: {
    flex: 1,
    marginTop: 5,
    color: theme.colors.subtext,
    fontFamily: theme.typography.regular,
    fontSize: 9,
    lineHeight: 12.5,
  },
  eventMemoryTile: { overflow: 'hidden', backgroundColor: theme.circle.accentSoft },
  eventMemoryArtwork: { flex: 1, width: '100%', borderRadius: 0 },
  eventMemoryShade: {
    flex: 1,
    padding: 9,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(8,15,34,0.16)',
  },
  eventMemoryBadge: {
    alignSelf: 'flex-start',
    minHeight: 23,
    paddingHorizontal: 7,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10,18,42,0.48)',
  },
  eventMemoryBadgeText: { color: '#fff', fontFamily: theme.typography.bold, fontSize: 8, letterSpacing: 0.55 },
  eventMemoryTitle: { color: '#fff', fontFamily: theme.typography.bold, fontSize: 12, lineHeight: 15, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 5 },
  eventMemoryMeta: { marginTop: 3, color: 'rgba(255,255,255,0.86)', fontFamily: theme.typography.semibold, fontSize: 8.5 },
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
  decoratedMembersStrip: {
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.52)',
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
  decoratedTabs: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.58)',
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
