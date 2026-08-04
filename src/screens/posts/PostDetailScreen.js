import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Video } from 'expo-av';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { Avatar } from '../../components/Avatar';
import { PostOwnerMenu } from '../../components/posts/PostOwnerMenu';
import { FramedPostImage } from '../../components/posts/FramedPostImage';
import { mediaPresentationForIndex } from '../../utils/postPresentation';
import { usePostCarouselHeight } from '../../hooks/usePostCarouselHeight';
import {
  InstagramCommentComposer,
  InstagramCommentRow,
  InstagramCommentsEmpty,
  InstagramCommentsError,
  InstagramCommentsLoading,
} from '../../components/comments/InstagramComments';
import {
  addPostComment,
  fetchPostComments,
  togglePostLike,
} from '../../services/feedService';
import {
  deleteOwnPost,
  fetchPostDetail,
} from '../../services/postService';
import {
  fetchMyMutualPreviewPostId,
  setMyMutualPreviewPost,
} from '../../services/profileService';
import { timeAgo } from '../../utils/timeAgo';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

function localCommentId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PostDetailScreen({ route, navigation }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { postId } = route.params || {};
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);
  const commentInputRef = useRef(null);
  const mountedRef = useRef(true);
  const cachedDetail = readNavigationCache(navigationCacheKeys.postPreview(postId));
  const hasLoadedRef = useRef(Boolean(cachedDetail?.post));

  const [post, setPost] = useState(cachedDetail?.post || null);
  const [author, setAuthor] = useState(cachedDetail?.author || null);
  const [media, setMedia] = useState(cachedDetail?.media || []);
  const [loading, setLoading] = useState(!cachedDetail?.post);
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(Boolean(cachedDetail?.likedByMe));
  const [likes, setLikes] = useState(Number(cachedDetail?.likes || 0));
  const [liking, setLiking] = useState(false);
  const [commentCount, setCommentCount] = useState(Number(cachedDetail?.commentCount || 0));
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [isOwner, setIsOwner] = useState(Boolean(cachedDetail?.isOwner));
  const [ownerMenuVisible, setOwnerMenuVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mutualPreviewPostId, setMutualPreviewPostId] = useState(null);
  const [previewSaving, setPreviewSaving] = useState(false);

  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);

  const mediaWidth = Math.min(width, 720);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const detail = await fetchPostDetail(postId);

      if (!mountedRef.current) return;

      setPost(detail.post);
      setAuthor(detail.author);
      setMedia(detail.media);
      setLikes(detail.likes);
      writeNavigationCache(navigationCacheKeys.postPreview(postId), detail);
      setCommentCount(detail.commentCount);
      setLiked(detail.likedByMe);
      setIsOwner(detail.isOwner);
      if (detail.isOwner) {
        setMutualPreviewPostId(await fetchMyMutualPreviewPostId());
      } else {
        setMutualPreviewPostId(null);
      }
      if (!silent) setActiveMediaIndex(0);
    } catch (loadError) {
      if (!mountedRef.current) return;

      if (silent) {
        console.warn('Post refresh failed.', loadError);
      } else {
        setError(loadError?.message || 'The post could not be loaded.');
      }
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, [postId]);

  const loadComments = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setCommentsLoading(true);
    setCommentsError(null);

    try {
      const rows = await fetchPostComments(postId);
      if (!mountedRef.current) return;
      setComments(rows);
      setCommentCount(rows.length);
    } catch (commentsLoadError) {
      if (!mountedRef.current) return;
      setCommentsError(
        commentsLoadError?.message || 'Comments could not be loaded.'
      );
    } finally {
      if (mountedRef.current && !silent) setCommentsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    mountedRef.current = true;
    void load({ silent: hasLoadedRef.current }).finally(() => {
      hasLoadedRef.current = true;
    });
    loadComments();

    const unsubscribe = navigation.addListener('focus', () => {
      if (!mountedRef.current) return;
      load({ silent: true });
      loadComments({ silent: true });
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [load, loadComments, navigation]);

  const onToggleLike = async () => {
    if (liking) return;

    const previousLiked = liked;
    const previousLikes = likes;
    const nextLiked = !previousLiked;

    setLiking(true);
    setLiked(nextLiked);
    setLikes(Math.max(0, previousLikes + (nextLiked ? 1 : -1)));

    try {
      await togglePostLike(postId);
    } catch (likeError) {
      setLiked(previousLiked);
      setLikes(previousLikes);
      Alert.alert(
        'Like not saved',
        likeError?.message || 'Please try again.'
      );
    } finally {
      if (mountedRef.current) setLiking(false);
    }
  };

  const submitComment = async () => {
    const text = commentText.trim();
    if (!text || commentSending) return;

    const temporaryId = localCommentId();
    const temporaryComment = {
      id: temporaryId,
      userId: null,
      userName: 'You',
      avatarUri: null,
      text,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setCommentSending(true);
    setCommentText('');
    setComments((current) => [...current, temporaryComment]);
    setCommentCount((current) => current + 1);

    try {
      await addPostComment(postId, text);
      const rows = await fetchPostComments(postId);

      if (!mountedRef.current) return;
      setComments(rows);
      setCommentCount(rows.length);
    } catch (commentError) {
      if (mountedRef.current) {
        setComments((current) =>
          current.filter((comment) => comment.id !== temporaryId)
        );
        setCommentCount((current) => Math.max(0, current - 1));
        setCommentText(text);
      }

      Alert.alert(
        'Comment not posted',
        commentError?.message || 'Please try again.'
      );
    } finally {
      if (mountedRef.current) setCommentSending(false);
    }
  };

  const focusCommentComposer = () => {
    requestAnimationFrame(() => {
      commentInputRef.current?.focus?.();
    });
  };

  const editPost = () => {
    setOwnerMenuVisible(false);
    navigation.navigate('EditPost', { postId });
  };

  const removePost = async () => {
    if (deleting) return;

    setDeleting(true);
    try {
      await deleteOwnPost(postId);
      setOwnerMenuVisible(false);
      navigation.goBack();
    } catch (deleteError) {
      Alert.alert(
        'Post not deleted',
        deleteError?.message || 'Please try again.'
      );
    } finally {
      if (mountedRef.current) setDeleting(false);
    }
  };

  const saveMutualPreview = async (nextPostId) => {
    if (previewSaving) return;

    setPreviewSaving(true);
    try {
      const savedPostId = await setMyMutualPreviewPost(nextPostId);
      setMutualPreviewPostId(savedPostId);
      setOwnerMenuVisible(false);
    } catch (previewError) {
      Alert.alert(
        'Preview not updated',
        previewError?.message || 'Please try again.'
      );
    } finally {
      if (mountedRef.current) setPreviewSaving(false);
    }
  };

  const toggleMutualPreview = () => {
    if (!isOwner || previewSaving) return;

    if (mutualPreviewPostId === postId) {
      saveMutualPreview(null);
      return;
    }

    Alert.alert(
      'Show this post to mutuals?',
      'People who share trusted contact context with you will be able to see this one preview before you connect. Your full profile and other posts stay private.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Show post',
          onPress: () => saveMutualPreview(postId),
        },
      ]
    );
  };

  const displayMedia = media.length
    ? media
    : post?.image_url
      ? [
          {
            id: 'primary-image',
            url: post.image_url,
            media_type: /\.(mp4|mov|m4v)(?:$|\?)/i.test(post.image_url)
              ? 'video'
              : 'image',
          },
        ]
      : [];

  const postPresentation = {
    mediaPresentations: Array.isArray(post?.media_presentations) ? post.media_presentations : [],
    aspectRatio: post?.display_aspect_ratio == null ? null : Number(post.display_aspect_ratio),
    cropPoints: Array.isArray(post?.media_crop_points) ? post.media_crop_points : [],
  };
  const { animatedHeight: animatedMediaHeight, onScroll: onMediaScroll } = usePostCarouselHeight({
    media: displayMedia,
    presentation: postPresentation,
    width: mediaWidth,
    activeIndex: activeMediaIndex,
  });

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.centerRoot}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Loading post…</Text>
      </SafeAreaView>
    );
  }

  if (error || !post) {
    return (
      <SafeAreaView edges={['top']} style={styles.centerRoot}>
        <Ionicons name="alert-circle-outline" size={34} color={theme.colors.subtext} />
        <Text style={styles.errorTitle}>Post unavailable</Text>
        <Text style={styles.errorBody}>
          {error || 'The post could not be found.'}
        </Text>
        <View style={styles.errorActions}>
          <Pressable onPress={() => navigation.goBack()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Go back</Text>
          </Pressable>
          <Pressable onPress={() => load()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const postHeader = (
    <View style={styles.card}>
      <Pressable
        onPress={() =>
          author?.id &&
          navigation.navigate('Profile', {
            userId: author.id,
            name: author.display_name,
          })
        }
        style={styles.authorRow}
      >
        <Avatar
          size={40}
          name={author?.display_name || 'Unknown'}
          uri={author?.avatar_url}
        />
        <View style={styles.authorText}>
          <Text style={styles.authorName} numberOfLines={1}>
            {author?.display_name || 'Unknown'}
          </Text>
          <Text style={styles.timestamp}>{timeAgo(post.created_at)}</Text>
        </View>
      </Pressable>

      <Animated.View style={[styles.mediaSection, { height: animatedMediaHeight }]}>
        <FlatList
          horizontal
          pagingEnabled
          data={displayMedia}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          onScroll={onMediaScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(event) => {
            const offset = event.nativeEvent.contentOffset.x || 0;
            setActiveMediaIndex(Math.max(0, Math.min(displayMedia.length - 1, Math.round(offset / mediaWidth))));
          }}
          renderItem={({ item, index }) => {
            const itemPresentation = mediaPresentationForIndex(postPresentation, index, item);
            const itemHeight = mediaWidth / itemPresentation.aspectRatio;
            return (
              <View style={[styles.mediaSlide, { width: mediaWidth, height: itemHeight }]}>
                {item.media_type === 'video' ? (
                  <Video
                    source={{ uri: item.url }}
                    style={styles.media}
                    resizeMode={itemPresentation.fit === 'crop' ? 'cover' : 'contain'}
                    shouldPlay={activeMediaIndex === index && !ownerMenuVisible}
                    isLooping
                    useNativeControls
                  />
                ) : (
                  <FramedPostImage
                    uri={item.url}
                    aspectRatio={itemPresentation.aspectRatio}
                    fit={itemPresentation.fit}
                    cropPoint={itemPresentation}
                    sourceWidth={itemPresentation.width}
                    sourceHeight={itemPresentation.height}
                  />
                )}
              </View>
            );
          }}
        />

        {displayMedia.length > 1 ? (
          <View style={styles.pageBadge}>
            <Text style={styles.pageBadgeText}>
              {activeMediaIndex + 1}/{displayMedia.length}
            </Text>
          </View>
        ) : null}
      </Animated.View>

      <View style={styles.engagementRow}>
        <Pressable
          onPress={onToggleLike}
          disabled={liking}
          hitSlop={10}
          style={({ pressed }) => [
            styles.engagementButton,
            (pressed || liking) && styles.pressed,
          ]}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={23}
            color={liked ? '#ff3b30' : theme.colors.text}
          />
          <Text style={styles.engagementText}>
            {likes} {likes === 1 ? 'like' : 'likes'}
          </Text>
        </Pressable>

        <Pressable
          onPress={focusCommentComposer}
          hitSlop={10}
          style={styles.engagementButton}
        >
          <Ionicons name="chatbubble-outline" size={22} color={theme.colors.text} />
          <Text style={styles.engagementText}>
            {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.details}>
        {post.caption ? (
          <Text style={styles.caption}>
            <Text style={styles.captionName}>
              {author?.display_name || 'Unknown'}{' '}
            </Text>
            <Text style={styles.captionBody}>{post.caption}</Text>
          </Text>
        ) : null}
      </View>

      <View style={styles.commentsDivider} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.headerButton}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
        {isOwner ? (
          <Pressable
            onPress={() => setOwnerMenuVisible(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Manage post"
            style={styles.headerButton}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.text} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.contentWidth}>
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={postHeader}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <InstagramCommentRow
                comment={{
                  id: item.id,
                  name: item.userName,
                  avatarUri: item.avatarUri,
                  body: item.text,
                  timeLabel: item.createdAt ? timeAgo(item.createdAt) : '',
                  pending: item.pending,
                }}
                onOpenProfile={item.userId
                  ? () => navigation.navigate('Profile', { userId: item.userId })
                  : undefined}
              />
            )}
            ListEmptyComponent={commentsLoading ? (
              <InstagramCommentsLoading />
            ) : commentsError ? (
              <InstagramCommentsError
                message={commentsError}
                onRetry={() => loadComments()}
              />
            ) : (
              <InstagramCommentsEmpty />
            )}
          />

          <InstagramCommentComposer
            inputRef={commentInputRef}
            value={commentText}
            onChangeText={setCommentText}
            onSubmit={submitComment}
            sending={commentSending}
            bottomInset={insets.bottom}
          />
        </View>
      </KeyboardAvoidingView>

      <PostOwnerMenu
        visible={ownerMenuVisible}
        busy={deleting}
        previewBusy={previewSaving}
        isMutualPreview={mutualPreviewPostId === postId}
        onClose={() => {
          if (!deleting && !previewSaving) setOwnerMenuVisible(false);
        }}
        onToggleMutualPreview={toggleMutualPreview}
        onEdit={editPost}
        onDelete={removePost}
      />
    </SafeAreaView>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  keyboardView: { flex: 1 },
  contentWidth: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  centerRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: theme.colors.bg,
  },
  stateText: { marginTop: 10, fontFamily: 'Manrope_400Regular', color: theme.colors.subtext },
  errorTitle: {
    marginTop: 12,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    color: theme.colors.text,
  },
  errorBody: {
    marginTop: 6,
    fontFamily: 'Manrope_400Regular',
    color: theme.colors.subtext,
    textAlign: 'center',
  },
  errorActions: { flexDirection: 'row', marginTop: 16, gap: 10 },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
  },
  secondaryButtonText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold' },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.circle.accent,
  },
  primaryButtonText: { color: theme.colors.onPrimary, fontFamily: 'Manrope_700Bold' },
  header: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  headerButton: { width: 54, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Manrope_700Bold', fontSize: 18, color: theme.colors.text },
  listContent: { flexGrow: 1, paddingBottom: 22 },
  card: { width: '100%', alignSelf: 'center', backgroundColor: theme.colors.surface },
  authorRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  authorText: { marginLeft: 10, flex: 1 },
  authorName: { fontFamily: 'Manrope_700Bold', color: theme.colors.text },
  timestamp: {
    marginTop: 1,
    fontFamily: 'Manrope_400Regular',
    color: theme.colors.subtext,
    fontSize: 12,
  },
  mediaSection: { position: 'relative', alignItems: 'center', backgroundColor: '#FFFFFF' },
  mediaSlide: { backgroundColor: '#FFFFFF', overflow: 'hidden' },
  media: { width: '100%', height: '100%' },
  pageBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  pageBadgeText: { color: '#fff', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 13,
    paddingTop: 12,
  },
  engagementButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5 },
  engagementText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  details: { paddingHorizontal: 13, paddingTop: 8, paddingBottom: 13 },
  caption: { marginTop: 6, color: theme.colors.text },
  captionName: { fontFamily: 'Manrope_700Bold' },
  captionBody: { fontFamily: 'Manrope_400Regular' },
  pressed: { opacity: 0.7 },
  commentsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginBottom: 2,
  },
  });
}
