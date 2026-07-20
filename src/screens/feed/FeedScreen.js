import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import {
  addPostComment,
  fetchFeedPage,
  fetchPostComments,
  togglePostLike,
} from '../../services/feedService';
import {
  deleteOwnStory,
  fetchActiveStories,
} from '../../services/storyService';
import { PostCard } from '../../components/feed/PostCard';
import { CommentsModal } from '../../components/feed/CommentsModal';
import { StoriesRail } from '../../components/stories/StoriesRail';
import { StoryViewer } from '../../components/stories/StoryViewer';

const PAGE_SIZE = 10;

function errorMessage(error, fallback) {
  return error?.message || fallback;
}

function localCommentId() {
  return `local-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function FeedScreen({ navigation }) {
  const [posts, setPosts] = useState([]);
  const [stories, setStories] = useState([]);
  const [authed, setAuthed] = useState(false);

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState(null);
  const [storyError, setStoryError] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const [openPostId, setOpenPostId] = useState(null);
  const [activeComments, setActiveComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);

  const [storyOpen, setStoryOpen] = useState(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [storyDeletingId, setStoryDeletingId] = useState(null);
  const [seenStoryUserIds, setSeenStoryUserIds] = useState(
    () => new Set()
  );
  const [visiblePostIds, setVisiblePostIds] = useState(() => new Set());

  const mountedRef = useRef(true);
  const postsRef = useRef([]);
  const initialLoadFinishedRef = useRef(false);
  const likeRequestsRef = useRef(new Set());
  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 60,
  });
  const onViewableItemsChangedRef = useRef(({ viewableItems }) => {
    setVisiblePostIds(
      new Set(
        viewableItems
          .map((item) => item.item?.id)
          .filter(Boolean)
      )
    );
  });

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const refreshFeed = useCallback(async (mode = 'silent') => {
    if (mode === 'initial') setInitialLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    setFeedError(null);

    try {
      const page = await fetchFeedPage({
        limit: PAGE_SIZE,
        before: new Date().toISOString(),
      });

      if (!mountedRef.current) return;

      setPosts(page.posts);
      setCursor(page.cursor);
      setHasMore(page.posts.length === PAGE_SIZE);
    } catch (error) {
      if (!mountedRef.current) return;
      setFeedError(
        errorMessage(error, 'The feed could not be loaded.')
      );
    } finally {
      if (!mountedRef.current) return;
      if (mode === 'initial') setInitialLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      initialLoadFinishedRef.current = true;
    }
  }, []);

  const refreshStories = useCallback(async () => {
    setStoryError(null);

    try {
      const activeStories = await fetchActiveStories();
      if (mountedRef.current) setStories(activeStories);
    } catch (error) {
      if (!mountedRef.current) return;
      setStoryError(
        errorMessage(error, 'Stories could not be loaded.')
      );
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let feedChannel = null;
    let storyChannel = null;

    const start = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;
        if (!mountedRef.current) return;

        const isAuthed = Boolean(session);
        setAuthed(isAuthed);

        if (!isAuthed) {
          setInitialLoading(false);
          setFeedError('Sign in to view your feed.');
          initialLoadFinishedRef.current = true;
          return;
        }

        await Promise.all([
          refreshFeed('initial'),
          refreshStories(),
        ]);

        if (!mountedRef.current) return;

        feedChannel = supabase
          .channel('feed_rt')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'posts',
            },
            () => refreshFeed('silent')
          )
          .subscribe();

        storyChannel = supabase
          .channel('stories_rt')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'stories',
            },
            () => refreshStories()
          )
          .subscribe();
      } catch (error) {
        if (!mountedRef.current) return;
        setInitialLoading(false);
        setFeedError(
          errorMessage(error, 'The feed could not be started.')
        );
        initialLoadFinishedRef.current = true;
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      if (feedChannel) supabase.removeChannel(feedChannel);
      if (storyChannel) supabase.removeChannel(storyChannel);
    };
  }, [refreshFeed, refreshStories]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!initialLoadFinishedRef.current || !authed) return;

      refreshFeed('silent');
      refreshStories();
    });

    return unsubscribe;
  }, [authed, navigation, refreshFeed, refreshStories]);


  useEffect(() => {
    const expirationTimes = stories
      .flatMap((story) => story.items || [])
      .map((item) => new Date(item.expires_at).getTime())
      .filter((timestamp) => Number.isFinite(timestamp));

    if (!expirationTimes.length) return undefined;

    const nextExpiration = Math.min(...expirationTimes);
    const delay = Math.max(1000, nextExpiration - Date.now() + 500);
    const timer = setTimeout(
      () => refreshStories(),
      Math.min(delay, 2_147_000_000)
    );

    return () => clearTimeout(timer);
  }, [refreshStories, stories]);

  useEffect(() => {
    if (storyOpen === null) return;

    const currentStory = stories[storyOpen];
    if (!currentStory?.userId) return;

    setSeenStoryUserIds((currentSeen) => {
      if (currentSeen.has(currentStory.userId)) return currentSeen;

      const nextSeen = new Set(currentSeen);
      nextSeen.add(currentStory.userId);
      return nextSeen;
    });
  }, [stories, storyOpen]);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      refreshFeed('refresh'),
      refreshStories(),
    ]);
  }, [refreshFeed, refreshStories]);

  const loadMore = useCallback(async () => {
    if (
      !authed ||
      loadingMore ||
      !hasMore ||
      !cursor
    ) {
      return;
    }

    setLoadingMore(true);

    try {
      const page = await fetchFeedPage({
        limit: PAGE_SIZE,
        before: cursor,
      });

      if (!mountedRef.current) return;

      setPosts((currentPosts) => {
        const seen = new Set(
          currentPosts.map((post) => post.id)
        );
        const newPosts = page.posts.filter(
          (post) => !seen.has(post.id)
        );
        return [...currentPosts, ...newPosts];
      });

      setCursor(page.cursor);
      setHasMore(page.posts.length === PAGE_SIZE);
    } catch (error) {
      if (!mountedRef.current) return;
      setFeedError(
        errorMessage(error, 'More posts could not be loaded.')
      );
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [authed, cursor, hasMore, loadingMore]);

  const toggleLike = useCallback(async (postId) => {
    if (likeRequestsRef.current.has(postId)) return;

    const previousPost = postsRef.current.find(
      (post) => post.id === postId
    );

    if (!previousPost) return;

    likeRequestsRef.current.add(postId);

    const nextLiked = !previousPost.liked;
    const nextLikes = Math.max(
      0,
      previousPost.likes + (nextLiked ? 1 : -1)
    );

    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              liked: nextLiked,
              likes: nextLikes,
            }
          : post
      )
    );

    try {
      await togglePostLike(postId);
    } catch (error) {
      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId ? previousPost : post
        )
      );

      Alert.alert(
        'Like not saved',
        errorMessage(error, 'Please try again.')
      );
    } finally {
      likeRequestsRef.current.delete(postId);
    }
  }, []);

  const loadComments = useCallback(async (postId) => {
    setCommentsLoading(true);
    setCommentsError(null);

    try {
      const comments = await fetchPostComments(postId);
      if (mountedRef.current) {
        setActiveComments(comments);
        setPosts((currentPosts) =>
          currentPosts.map((post) =>
            post.id === postId
              ? { ...post, commentCount: comments.length }
              : post
          )
        );
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setCommentsError(
        errorMessage(error, 'Comments could not be loaded.')
      );
    } finally {
      if (mountedRef.current) setCommentsLoading(false);
    }
  }, []);

  const openComments = useCallback(
    (postId) => {
      setOpenPostId(postId);
      setActiveComments([]);
      setCommentText('');
      loadComments(postId);
    },
    [loadComments]
  );

  const closeComments = useCallback(() => {
    setOpenPostId(null);
    setActiveComments([]);
    setCommentsError(null);
    setCommentText('');
  }, []);

  const submitComment = useCallback(async () => {
    const text = commentText.trim();
    const postId = openPostId;

    if (!text || !postId || commentSending) return;

    const temporaryId = localCommentId();
    const temporaryComment = {
      id: temporaryId,
      userName: 'You',
      avatarUri: null,
      text,
      pending: true,
    };

    setCommentSending(true);
    setCommentText('');
    setActiveComments((comments) => [
      ...comments,
      temporaryComment,
    ]);

    try {
      await addPostComment(postId, text);
      const comments = await fetchPostComments(postId);

      if (mountedRef.current && openPostId === postId) {
        setActiveComments(comments);
        setPosts((currentPosts) =>
          currentPosts.map((post) =>
            post.id === postId
              ? { ...post, commentCount: comments.length }
              : post
          )
        );
      }
    } catch (error) {
      if (mountedRef.current) {
        setActiveComments((comments) =>
          comments.filter(
            (comment) => comment.id !== temporaryId
          )
        );
        setCommentText(text);
      }

      Alert.alert(
        'Comment not posted',
        errorMessage(error, 'Please try again.')
      );
    } finally {
      if (mountedRef.current) setCommentSending(false);
    }
  }, [commentSending, commentText, openPostId]);

  const retryFeed = useCallback(() => {
    refreshFeed('initial');
    refreshStories();
  }, [refreshFeed, refreshStories]);

  const openStory = useCallback((userIndex) => {
    setStoryOpen(userIndex);
    setStoryIndex(0);
  }, []);

  const closeStory = useCallback(() => {
    setStoryOpen(null);
    setStoryIndex(0);
  }, []);

  const deleteStory = useCallback(
    async (storyItem) => {
      if (!storyItem?.id || storyDeletingId) return;

      setStoryDeletingId(storyItem.id);

      try {
        await deleteOwnStory(storyItem);
        closeStory();
        await refreshStories();
      } catch (error) {
        Alert.alert(
          'Story not deleted',
          errorMessage(error, 'Please try again.')
        );
      } finally {
        if (mountedRef.current) setStoryDeletingId(null);
      }
    },
    [closeStory, refreshStories, storyDeletingId]
  );

  const nextStory = useCallback(() => {
    setStoryOpen((currentUserIndex) => {
      if (currentUserIndex === null) return null;

      const currentUser = stories[currentUserIndex];
      if (!currentUser) return null;

      if (storyIndex + 1 < currentUser.items.length) {
        setStoryIndex((index) => index + 1);
        return currentUserIndex;
      }

      if (currentUserIndex + 1 < stories.length) {
        setStoryIndex(0);
        return currentUserIndex + 1;
      }

      return null;
    });
  }, [stories, storyIndex]);

  const previousStory = useCallback(() => {
    setStoryOpen((currentUserIndex) => {
      if (currentUserIndex === null) return null;

      if (storyIndex > 0) {
        setStoryIndex((index) => index - 1);
        return currentUserIndex;
      }

      if (currentUserIndex > 0) {
        const previousUser = stories[currentUserIndex - 1];
        setStoryIndex(
          Math.max(0, previousUser.items.length - 1)
        );
        return currentUserIndex - 1;
      }

      return null;
    });
  }, [stories, storyIndex]);

  if (initialLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.centerRoot}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading your feed…</Text>
      </SafeAreaView>
    );
  }

  if (feedError && posts.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={styles.centerRoot}>
        <Ionicons
          name="cloud-offline-outline"
          size={34}
          color={COLORS.subtext}
        />
        <Text style={styles.errorTitle}>Couldn’t load the feed</Text>
        <Text style={styles.errorBody}>{feedError}</Text>
        <Pressable onPress={retryFeed} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <FlatList
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            isVisible={visiblePostIds.has(item.id)}
            onToggleLike={() => toggleLike(item.id)}
            onDoubleLike={() => toggleLike(item.id)}
            onOpenComments={() => openComments(item.id)}
            onOpenPost={() =>
              navigation.navigate('PostDetail', {
                postId: item.id,
              })
            }
            onOpenProfile={
              item.user.id
                ? () =>
                    navigation.navigate('Profile', {
                      userId: item.user.id,
                      name: item.user.name,
                    })
                : undefined
            }
          />
        )}
        viewabilityConfig={viewabilityConfigRef.current}
        onViewableItemsChanged={
          onViewableItemsChangedRef.current
        }
        onEndReachedThreshold={0.25}
        onEndReached={loadMore}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.feedHeader}>
              <Text style={styles.feedTitle}>Feed</Text>
              <Pressable
                onPress={() => navigation.navigate('CreatePost')}
                hitSlop={10}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={27}
                  color={COLORS.text}
                />
              </Pressable>
            </View>

            <StoriesRail
              stories={stories}
              seenStoryUserIds={seenStoryUserIds}
              onAddYourStory={() =>
                navigation.navigate('CreateStory')
              }
              onOpen={openStory}
            />

            {storyError ? (
              <Pressable
                onPress={refreshStories}
                style={({ pressed }) => [
                  styles.storyNotice,
                  pressed && styles.storyNoticePressed,
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={COLORS.subtext}
                />
                <Text style={styles.inlineNotice}>
                  {storyError} Tap to retry.
                </Text>
              </Pressable>
            ) : null}

            {feedError ? (
              <Pressable
                onPress={() => refreshFeed('silent')}
                style={styles.noticeBanner}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={COLORS.text}
                />
                <Text style={styles.noticeText} numberOfLines={2}>
                  {feedError} Tap to retry.
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name="images-outline"
              size={38}
              color={COLORS.subtext}
            />
            <Text style={styles.emptyTitle}>Your feed is ready</Text>
            <Text style={styles.emptyBody}>
              New posts from your circles will appear here.
            </Text>
            <Pressable
              onPress={() => navigation.navigate('CreatePost')}
              style={styles.emptyButton}
            >
              <Text style={styles.emptyButtonText}>
                Create your first post
              </Text>
            </Pressable>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footerSpinner} />
          ) : !hasMore && posts.length ? (
            <Text style={styles.endText}>You’re all caught up.</Text>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      <CommentsModal
        visible={Boolean(openPostId)}
        comments={activeComments}
        loading={commentsLoading}
        error={commentsError}
        commentText={commentText}
        sending={commentSending}
        onChangeText={setCommentText}
        onSubmit={submitComment}
        onRetry={() => openPostId && loadComments(openPostId)}
        onClose={closeComments}
      />

      <Modal
        visible={storyOpen !== null}
        animationType="fade"
        onRequestClose={closeStory}
      >
        <SafeAreaView
          edges={['top', 'bottom']}
          style={styles.storyModal}
        >
          {storyOpen !== null && stories[storyOpen] ? (
            <StoryViewer
              user={stories[storyOpen]}
              index={storyIndex}
              onClose={closeStory}
              onNext={nextStory}
              onPrev={previousStory}
              onDelete={deleteStory}
              deleting={
                storyDeletingId ===
                stories[storyOpen]?.items?.[storyIndex]?.id
              }
            />
          ) : null}
        </SafeAreaView>
      </Modal>

      <Pressable
        onPress={() => navigation.navigate('CreatePost')}
        style={({ pressed }) => [
          styles.floatingButton,
          pressed && styles.floatingButtonPressed,
        ]}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centerRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorTitle: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  errorBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
  },
  retryButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  feedTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 24,
  },
  storyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f4f4f4',
  },
  storyNoticePressed: {
    opacity: 0.7,
  },
  inlineNotice: {
    flex: 1,
    marginLeft: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f4f4f4',
  },
  noticeText: {
    flex: 1,
    marginLeft: 8,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 90,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingTop: 58,
  },
  emptyTitle: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  emptyBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  emptyButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  footerSpinner: {
    marginVertical: 16,
  },
  endText: {
    marginVertical: 18,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  storyModal: {
    flex: 1,
    backgroundColor: '#000',
  },
  floatingButton: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  floatingButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
