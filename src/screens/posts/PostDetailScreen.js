import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { COLORS } from '../../theme/colors';
import { Avatar } from '../../components/Avatar';
import { PostOwnerMenu } from '../../components/posts/PostOwnerMenu';
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
import { timeAgo } from '../../utils/timeAgo';

function localCommentId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PostDetailScreen({ route, navigation }) {
  const { postId } = route.params || {};
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);
  const commentInputRef = useRef(null);
  const mountedRef = useRef(true);

  const [post, setPost] = useState(null);
  const [author, setAuthor] = useState(null);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [liking, setLiking] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [ownerMenuVisible, setOwnerMenuVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      setCommentCount(detail.commentCount);
      setLiked(detail.likedByMe);
      setIsOwner(detail.isOwner);
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
    load();
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

    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd?.({ animated: true });
    });

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
      listRef.current?.scrollToEnd?.({ animated: true });
      setTimeout(() => commentInputRef.current?.focus?.(), 120);
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
        <Ionicons name="alert-circle-outline" size={34} color={COLORS.subtext} />
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

      <View style={styles.mediaSection}>
        <FlatList
          horizontal
          pagingEnabled
          data={displayMedia}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const offset = event.nativeEvent.contentOffset.x || 0;
            setActiveMediaIndex(Math.round(offset / mediaWidth));
          }}
          renderItem={({ item, index }) => (
            <View style={[styles.mediaSlide, { width: mediaWidth }]}>
              {item.media_type === 'video' ? (
                <Video
                  source={{ uri: item.url }}
                  style={styles.media}
                  resizeMode="contain"
                  shouldPlay={
                    activeMediaIndex === index &&
                    !ownerMenuVisible
                  }
                  isLooping
                  useNativeControls
                />
              ) : (
                <Image
                  source={{ uri: item.url }}
                  style={styles.media}
                  resizeMode="contain"
                />
              )}
            </View>
          )}
        />

        {displayMedia.length > 1 ? (
          <View style={styles.pageBadge}>
            <Text style={styles.pageBadgeText}>
              {activeMediaIndex + 1}/{displayMedia.length}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onToggleLike}
          disabled={liking}
          hitSlop={10}
          style={styles.actionButton}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={28}
            color={liked ? '#e11d48' : COLORS.text}
          />
        </Pressable>

        <Pressable
          onPress={focusCommentComposer}
          hitSlop={10}
          style={styles.actionButton}
        >
          <Ionicons name="chatbubble-outline" size={26} color={COLORS.text} />
        </Pressable>
      </View>

      <View style={styles.details}>
        <Text style={styles.likes}>
          {likes} {likes === 1 ? 'like' : 'likes'}
        </Text>

        {post.caption ? (
          <Text style={styles.caption}>
            <Text style={styles.captionName}>
              {author?.display_name || 'Unknown'}{' '}
            </Text>
            <Text style={styles.captionBody}>{post.caption}</Text>
          </Text>
        ) : null}

        <Text style={styles.commentCount}>
          {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
        </Text>
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
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
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
            <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.text} />
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
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
        onClose={() => !deleting && setOwnerMenuVisible(false)}
        onEdit={editPost}
        onDelete={removePost}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  keyboardView: {
    flex: 1,
  },
  contentWidth: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  centerRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
  },
  stateText: {
    marginTop: 10,
    fontFamily: 'Manrope_400Regular',
    color: COLORS.subtext,
  },
  errorTitle: {
    marginTop: 12,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    color: COLORS.text,
  },
  errorBody: {
    marginTop: 6,
    fontFamily: 'Manrope_400Regular',
    color: COLORS.subtext,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  header: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerButton: {
    width: 54,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    color: COLORS.text,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 22,
  },
  card: {
    width: '100%',
    alignSelf: 'center',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  authorText: {
    marginLeft: 10,
    flex: 1,
  },
  authorName: {
    fontFamily: 'Manrope_700Bold',
    color: COLORS.text,
  },
  timestamp: {
    marginTop: 1,
    fontFamily: 'Manrope_400Regular',
    color: COLORS.subtext,
    fontSize: 12,
  },
  mediaSection: {
    position: 'relative',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  mediaSlide: {
    aspectRatio: 1,
    backgroundColor: '#000',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  pageBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  pageBadgeText: {
    color: '#fff',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  actionButton: {
    marginRight: 17,
  },
  details: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 13,
  },
  likes: {
    fontFamily: 'Manrope_700Bold',
    color: COLORS.text,
  },
  caption: {
    marginTop: 6,
    color: COLORS.text,
  },
  captionName: {
    fontFamily: 'Manrope_700Bold',
  },
  captionBody: {
    fontFamily: 'Manrope_400Regular',
  },
  commentCount: {
    marginTop: 8,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  commentsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginBottom: 2,
  },
});
