import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
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
import { CircleBackdrop } from '../../components/circles/CircleBackdrop';
import { InstagramCommentsSheet } from '../../components/comments/InstagramCommentsSheet';
import { FramedPostImage } from '../../components/posts/FramedPostImage';
import { mediaPresentationForIndex } from '../../utils/postPresentation';
import { usePostCarouselHeight } from '../../hooks/usePostCarouselHeight';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { timeAgo } from '../../utils/timeAgo';
import {
  addCirclePostComment,
  deleteOwnCirclePost,
  deleteOwnCirclePostComment,
  listCirclePostComments,
  listCirclePosts,
  subscribeToCirclePostChanges,
  toggleCirclePostLike,
} from '../../services/circlePostService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';
import { reconcileRowsById } from '../../utils/reconcileRows';

const CIRCLE_POSTS_FOCUS_FRESH_MS = 12_000;
const CIRCLE_POSTS_REALTIME_DEBOUNCE_MS = 220;

function mapCircleComment(comment) {
  return {
    id: comment.id,
    userId: comment.userId || null,
    name: comment.displayName || 'Circle member',
    avatarUri: comment.avatarUri || null,
    body: comment.body || '',
    timeLabel: timeAgo(comment.createdAt),
    canDelete: Boolean(comment.canDelete),
  };
}

function sameCircleMedia(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return item?.id === other?.id
      && item?.url === other?.url
      && item?.mediaType === other?.mediaType
      && item?.width === other?.width
      && item?.height === other?.height;
  });
}

function sameCirclePost(left, right) {
  return left?.id === right?.id
    && left?.authorId === right?.authorId
    && left?.authorName === right?.authorName
    && left?.authorAvatar === right?.authorAvatar
    && left?.caption === right?.caption
    && left?.createdAt === right?.createdAt
    && left?.likedByMe === right?.likedByMe
    && left?.likeCount === right?.likeCount
    && left?.commentCount === right?.commentCount
    && left?.canEdit === right?.canEdit
    && sameCircleMedia(left?.media, right?.media)
    && JSON.stringify(left?.presentation || {}) === JSON.stringify(right?.presentation || {});
}

function CirclePostFeedCard({
  post,
  width,
  navigation,
  conversationId,
  onOpenComments,
  onToggleLike,
  onManage,
  likeBusy,
  styles,
  theme,
}) {
  const viewerItems = useMemo(() => (
    (post.media || []).map((item) => ({
      ...item,
      senderName: post.authorName,
      senderAvatar: post.authorAvatar,
      messageBody: post.caption,
      createdAt: post.createdAt,
    }))
  ), [post]);

  const openDetail = () => {
    writeNavigationCache(navigationCacheKeys.circlePost(post.id), post);
    navigation.navigate('CirclePostDetail', {
      conversationId,
      postId: post.id,
    });
  };

  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const { animatedHeight, onScroll } = usePostCarouselHeight({
    media: post.media,
    presentation: post.presentation,
    width,
    activeIndex: activeMediaIndex,
  });

  return (
    <View style={styles.card}>
      <View style={styles.authorRow}>
        <Pressable
          onPress={() => navigation.navigate('Profile', { userId: post.authorId })}
          style={({ pressed }) => [styles.authorIdentity, pressed && styles.pressed]}
        >
          <Avatar size={40} name={post.authorName} uri={post.authorAvatar} />
          <View style={styles.authorText}>
            <Text style={styles.authorName} numberOfLines={1}>{post.authorName}</Text>
            <View style={styles.privateTimeRow}>
              <Ionicons name="lock-closed" size={10} color={theme.colors.subtext} />
              <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
            </View>
          </View>
        </Pressable>
        {onManage ? (
          <Pressable
            onPress={onManage}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Manage post"
            style={styles.optionsButton}
          >
            <Ionicons name="ellipsis-horizontal" size={21} color={theme.colors.text} />
          </Pressable>
        ) : null}
      </View>

      <Animated.View style={{ height: animatedHeight, overflow: 'hidden' }}>
      <FlatList
        horizontal
        style={{ flexGrow: 0 }}
        pagingEnabled
        data={post.media}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => {
          const offset = event.nativeEvent.contentOffset.x || 0;
          setActiveMediaIndex(Math.max(0, Math.min(post.media.length - 1, Math.round(offset / width))));
        }}
        renderItem={({ item, index }) => {
          const itemPresentation = mediaPresentationForIndex(post.presentation, index, item);
          const itemHeight = width / itemPresentation.aspectRatio;
          return (
            <Pressable
              onPress={openDetail}
              style={[styles.mediaPage, { width, height: itemHeight }]}
            >
              {item.mediaType === 'image' ? (
                <FramedPostImage
                  uri={item.url}
                  aspectRatio={itemPresentation.aspectRatio}
                  fit={itemPresentation.fit}
                  cropPoint={itemPresentation}
                  sourceWidth={itemPresentation.width || item.width}
                  sourceHeight={itemPresentation.height || item.height}
                />
              ) : (
                <View style={styles.videoPage}>
                  <Ionicons name="play-circle" size={62} color="#fff" />
                </View>
              )}
            </Pressable>
          );
        }}
      />
      </Animated.View>

      <View style={styles.actionRow}>
        <Pressable
          onPress={onToggleLike}
          disabled={likeBusy}
          hitSlop={10}
          style={({ pressed }) => [styles.actionButton, (pressed || likeBusy) && styles.pressed]}
        >
          <Ionicons
            name={post.likedByMe ? 'heart' : 'heart-outline'}
            size={25}
            color={post.likedByMe ? '#ff5c67' : theme.colors.text}
          />
        </Pressable>
        <Text style={styles.engagementCount}>{post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}</Text>

        <Pressable onPress={onOpenComments} hitSlop={10} style={styles.commentActionButton}>
          <Ionicons name="chatbubble-outline" size={23} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.engagementCount}>{post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}</Text>

        {post.media.length > 1 ? (
          <View style={styles.mediaCountPill}>
            <Ionicons name="copy-outline" size={11} color={theme.colors.text} />
            <Text style={styles.mediaCount}>{post.media.length}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.details}>
        {post.caption ? (
          <Text numberOfLines={3} style={styles.caption}>
            <Text style={styles.captionAuthor}>{post.authorName} </Text>
            {post.caption}
          </Text>
        ) : null}
        <Pressable onPress={onOpenComments} style={styles.commentsButton}>
          <Text style={styles.commentsLink}>
            {post.commentCount
              ? `View all ${post.commentCount} ${post.commentCount === 1 ? 'comment' : 'comments'}`
              : 'Add a private comment'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const CirclePostFeedRow = React.memo(function CirclePostFeedRow({
  post,
  width,
  navigation,
  conversationId,
  onOpenComments,
  onToggleLike,
  onManage,
  likeBusy,
  styles,
  theme,
}) {
  const openComments = useCallback(
    () => onOpenComments(post),
    [onOpenComments, post]
  );
  const toggleLike = useCallback(
    () => onToggleLike(post),
    [onToggleLike, post]
  );
  const manage = useCallback(
    () => onManage(post),
    [onManage, post]
  );

  return (
    <CirclePostFeedCard
      post={post}
      width={width}
      navigation={navigation}
      conversationId={conversationId}
      onOpenComments={openComments}
      onToggleLike={toggleLike}
      onManage={post.canEdit ? manage : undefined}
      likeBusy={likeBusy}
      styles={styles}
      theme={theme}
    />
  );
});

function CirclePostsFeedContent({ route, navigation }) {
  const { conversationId, initialPostId, circleName } = route.params || {};
  const cachedPosts = readNavigationCache(navigationCacheKeys.circlePosts(conversationId));
  const hasInitialPosts = Array.isArray(cachedPosts);
  const initialPosts = hasInitialPosts ? cachedPosts : [];
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const stageWidth = Math.min(width - 24, 696);
  const [posts, setPosts] = useState(initialPosts);
  const postsRef = useRef(initialPosts);
  const [loading, setLoading] = useState(!hasInitialPosts);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentsPost, setCommentsPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const listRef = useRef(null);
  const didInitialScrollRef = useRef(false);
  const [togglingLikes, setTogglingLikes] = useState({});
  const [deletingPostId, setDeletingPostId] = useState(null);
  const hasLoadedRef = useRef(hasInitialPosts);
  const lastRefreshAtRef = useRef(hasInitialPosts ? Date.now() : 0);
  const loadInFlightRef = useRef(null);
  const realtimeTimerRef = useRef(null);
  const likeRequestsRef = useRef(new Set());
  const commentsPostIdRef = useRef(null);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    commentsPostIdRef.current = commentsPost?.id || null;
  }, [commentsPost?.id]);

  const load = useCallback(async ({ refresh = false, quiet = false } = {}) => {
    if (loadInFlightRef.current) return loadInFlightRef.current;
    if (refresh) setRefreshing(true);
    else if (!quiet) setLoading(true);
    setError('');

    const request = (async () => {
      try {
        const rows = await listCirclePosts(conversationId);
        const reconciled = reconcileRowsById(
          postsRef.current,
          rows,
          sameCirclePost
        );
        postsRef.current = reconciled;
        setPosts(reconciled);
        lastRefreshAtRef.current = Date.now();
        writeNavigationCache(navigationCacheKeys.circlePosts(conversationId), reconciled);
        reconciled.forEach((post) => {
          writeNavigationCache(navigationCacheKeys.circlePost(post.id), post);
        });
        setCommentsPost((current) => {
          if (!current) return current;
          return reconciled.find((post) => post.id === current.id) || current;
        });
      } catch (loadError) {
        setError(loadError?.message || 'Could not load Circle posts.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    })();

    loadInFlightRef.current = request.finally(() => {
      loadInFlightRef.current = null;
    });
    return loadInFlightRef.current;
  }, [conversationId]);

  const loadComments = useCallback(async (postId, { quiet = false } = {}) => {
    if (!postId) return;
    if (!quiet) setCommentsLoading(true);
    setCommentsError('');

    try {
      const rows = await listCirclePostComments(postId);
      setComments(rows.map(mapCircleComment));
      setPosts((current) => current.map((post) => (
        post.id === postId ? { ...post, commentCount: rows.length } : post
      )));
      setCommentsPost((current) => (
        current?.id === postId ? { ...current, commentCount: rows.length } : current
      ));
    } catch (loadError) {
      setCommentsError(loadError?.message || 'Private comments could not be loaded.');
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const isFresh = hasLoadedRef.current
        && Date.now() - lastRefreshAtRef.current < CIRCLE_POSTS_FOCUS_FRESH_MS;
      if (!isFresh) {
        void load({ quiet: hasLoadedRef.current }).finally(() => {
          hasLoadedRef.current = true;
        });
      }

      const scheduleRealtimeLoad = () => {
        if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = setTimeout(() => {
          realtimeTimerRef.current = null;
          void load({ quiet: true });
          const activeCommentPostId = commentsPostIdRef.current;
          if (activeCommentPostId) {
            void loadComments(activeCommentPostId, { quiet: true });
          }
        }, CIRCLE_POSTS_REALTIME_DEBOUNCE_MS);
      };

      const unsubscribe = subscribeToCirclePostChanges({
        conversationId,
        onChange: scheduleRealtimeLoad,
      });

      return () => {
        unsubscribe();
        if (realtimeTimerRef.current) {
          clearTimeout(realtimeTimerRef.current);
          realtimeTimerRef.current = null;
        }
      };
    }, [conversationId, load, loadComments])
  );


  useEffect(() => {
    if (didInitialScrollRef.current || !initialPostId || !posts.length) return;
    const index = posts.findIndex((post) => post.id === initialPostId);
    if (index < 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex?.({ index, animated: false, viewPosition: 0 });
      didInitialScrollRef.current = true;
    }, 80);
    return () => clearTimeout(timer);
  }, [initialPostId, posts]);

  const toggleLike = useCallback(async (post) => {
    if (!post?.id || likeRequestsRef.current.has(post.id)) return;
    likeRequestsRef.current.add(post.id);
    const previousLiked = Boolean(post.likedByMe);
    const previousCount = Number(post.likeCount || 0);
    const optimistic = {
      ...post,
      likedByMe: !previousLiked,
      likeCount: Math.max(0, previousCount + (previousLiked ? -1 : 1)),
    };

    setTogglingLikes((current) => ({ ...current, [post.id]: true }));
    setPosts((current) => {
      const next = current.map((item) => item.id === post.id ? optimistic : item);
      postsRef.current = next;
      return next;
    });
    setCommentsPost((current) => current?.id === post.id ? { ...current, ...optimistic } : current);

    try {
      const result = await toggleCirclePostLike(post.id);
      setPosts((current) => {
        const next = current.map((item) => (
          item.id === post.id ? { ...item, likedByMe: result.liked, likeCount: result.likeCount } : item
        ));
        postsRef.current = next;
        return next;
      });
      setCommentsPost((current) => current?.id === post.id
        ? { ...current, likedByMe: result.liked, likeCount: result.likeCount }
        : current);
    } catch (likeError) {
      setPosts((current) => {
        const next = current.map((item) => (
          item.id === post.id ? { ...item, likedByMe: previousLiked, likeCount: previousCount } : item
        ));
        postsRef.current = next;
        return next;
      });
      Alert.alert('Like not updated', likeError?.message || 'Please try again.');
    } finally {
      likeRequestsRef.current.delete(post.id);
      setTogglingLikes((current) => ({ ...current, [post.id]: false }));
    }
  }, []);

  const managePost = useCallback((post) => {
    if (!post?.canEdit || deletingPostId) return;

    const edit = () => navigation.navigate('EditCirclePost', {
      postId: post.id,
      conversationId,
    });

    const remove = () => {
      Alert.alert(
        'Delete this Circle post?',
        'The post, comments, likes, and its separately uploaded media will be removed from the Circle.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Post',
            style: 'destructive',
            onPress: async () => {
              setDeletingPostId(post.id);
              try {
                await deleteOwnCirclePost(post.id);
                setPosts((current) => current.filter((item) => item.id !== post.id));
              } catch (deleteError) {
                Alert.alert('Circle post not deleted', deleteError?.message || 'Please try again.');
              } finally {
                setDeletingPostId(null);
              }
            },
          },
        ]
      );
    };

    Alert.alert('Circle post options', null, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit Caption', onPress: edit },
      { text: 'Delete Post', style: 'destructive', onPress: remove },
    ]);
    }, [conversationId, deletingPostId, navigation]);

  const openComments = useCallback((post) => {
    setCommentsPost(post);
    setComments([]);
    setCommentsError('');
    setCommentsVisible(true);
    loadComments(post.id);
  }, [loadComments]);

  const submitComment = async (body) => {
    if (!commentsPost?.id) return;
    const newComment = await addCirclePostComment(commentsPost.id, body);
    setComments((current) => [...current, mapCircleComment(newComment)]);
    setPosts((current) => current.map((post) => (
      post.id === commentsPost.id
        ? { ...post, commentCount: Number(post.commentCount || 0) + 1 }
        : post
    )));
    setCommentsPost((current) => current
      ? { ...current, commentCount: Number(current.commentCount || 0) + 1 }
      : current);
  };

  const deleteComment = (comment) => {
    if (!comment?.canDelete) return;
    Alert.alert(
      'Delete comment?',
      'This removes your comment from the private Circle post.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOwnCirclePostComment(comment.id);
              setComments((current) => current.filter((item) => item.id !== comment.id));
              setPosts((current) => current.map((post) => (
                post.id === commentsPost?.id
                  ? { ...post, commentCount: Math.max(0, Number(post.commentCount || 0) - 1) }
                  : post
              )));
              setCommentsPost((current) => current
                ? { ...current, commentCount: Math.max(0, Number(current.commentCount || 0) - 1) }
                : current);
            } catch (deleteError) {
              Alert.alert('Comment not deleted', deleteError?.message || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const openCommentAuthor = (commentUserId) => {
    setCommentsVisible(false);
    setTimeout(() => navigation.navigate('Profile', { userId: commentUserId }), 180);
  };

  const renderPost = useCallback(({ item }) => (
    <CirclePostFeedRow
      post={item}
      width={stageWidth}
      navigation={navigation}
      conversationId={conversationId}
      onOpenComments={openComments}
      onToggleLike={toggleLike}
      onManage={managePost}
      likeBusy={Boolean(togglingLikes[item.id])}
      styles={styles}
      theme={theme}
    />
  ), [
    conversationId,
    managePost,
    navigation,
    openComments,
    stageWidth,
    styles,
    theme,
    toggleLike,
    togglingLikes,
  ]);

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <CircleBackdrop conversationId={conversationId} />
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.circle.accent} />
          <Text style={styles.stateText}>Opening Circle posts…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <CircleBackdrop conversationId={conversationId} />

      {error && !posts.length ? (
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
          ref={listRef}
          data={posts}
          keyExtractor={(item) => item.id}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset?.({ offset: Math.max(0, averageItemLength * index), animated: false });
            setTimeout(() => listRef.current?.scrollToIndex?.({ index, animated: false }), 80);
          }}
          renderItem={renderPost}
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
                <Ionicons name="albums-outline" size={28} color={theme.colors.text} />
              </View>
              <Text style={styles.errorText}>No Circle posts yet.</Text>
              <Text style={styles.emptyBody}>The first intentional memory shared here will begin this private collection.</Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      <InstagramCommentsSheet
        visible={commentsVisible}
        title="Comments"
        subtitle={circleName ? `${circleName} · private` : 'Private Circle post'}
        comments={comments}
        loading={commentsLoading}
        error={commentsError}
        onClose={() => setCommentsVisible(false)}
        onRetry={() => loadComments(commentsPost?.id)}
        onSubmit={submitComment}
        onOpenProfile={openCommentAuthor}
        onDeleteComment={deleteComment}
        emptyBody="Be the first to leave a private comment."
        placeholder="Add a private comment…"
      />
    </SafeAreaView>
  );
}

export function CirclePostsFeedScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CirclePostsFeedContent {...props} />
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
      backgroundColor: 'rgba(255,255,255,0.91)',
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
    authorRow: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
    authorIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    authorText: { flex: 1, marginLeft: 10 },
    authorName: { fontFamily: 'Manrope_700Bold', color: theme.colors.text },
    privateTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    time: { fontFamily: 'Manrope_400Regular', color: theme.colors.subtext, fontSize: 11 },
    optionsButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    mediaPage: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    media: { width: '100%', height: '100%' },
    videoPage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' },
    actionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
    actionButton: { marginRight: 6 },
    commentActionButton: { marginLeft: 15, marginRight: 6 },
    engagementCount: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 12 },
    mediaCountPill: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.circle.accentSoft },
    mediaCount: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 10 },
    details: { paddingHorizontal: 13, paddingBottom: 16 },
    caption: { color: theme.colors.text, fontFamily: 'Manrope_400Regular', lineHeight: 19 },
    captionAuthor: { fontFamily: 'Manrope_700Bold' },
    commentsButton: { alignSelf: 'flex-start', paddingTop: 7, paddingBottom: 5, paddingRight: 18 },
    commentsLink: { color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 13 },
    centerState: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: 'transparent' },
    stateIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: theme.circle.accentSoft },
    stateText: { marginTop: 10, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
    errorText: { marginTop: 12, color: theme.colors.text, fontFamily: 'Manrope_700Bold', textAlign: 'center' },
    emptyBody: { maxWidth: 320, marginTop: 6, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
    retryButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.welcome.brandInk },
    retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
    pressed: { opacity: 0.7 },
  });
}
