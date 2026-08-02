import React, { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Animated,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../../components/Avatar';
import { FramedPostImage } from '../../components/posts/FramedPostImage';
import { mediaPresentationForIndex } from '../../utils/postPresentation';
import { usePostCarouselHeight } from '../../hooks/usePostCarouselHeight';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { timeAgo } from '../../utils/timeAgo';
import {
  InstagramCommentComposer,
  InstagramCommentRow,
  InstagramCommentsEmpty,
} from '../../components/comments/InstagramComments';
import {
  addCirclePostComment,
  deleteOwnCirclePost,
  deleteOwnCirclePostComment,
  getCirclePost,
  listCirclePostComments,
  subscribeToCirclePostChanges,
  toggleCirclePostLike,
} from '../../services/circlePostService';

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function PostMedia({ item, size, presentation, onPress, styles }) {
  const height = size / presentation.aspectRatio;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.mediaPage, { width: size, height }, pressed && styles.pressed]}
    >
      {item.mediaType === 'image' ? (
        <FramedPostImage
          uri={item.url}
          aspectRatio={presentation.aspectRatio}
          fit={presentation.fit}
          cropPoint={presentation}
          sourceWidth={presentation.width || item.width}
          sourceHeight={presentation.height || item.height}
        />
      ) : (
        <View style={styles.videoPage}>
          <Ionicons name="play-circle" size={62} color="#fff" />
          <Text style={styles.videoHint}>Tap to play</Text>
        </View>
      )}
    </Pressable>
  );
}

function CirclePostDetailContent({ route, navigation }) {
  const { postId, conversationId } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingLike, setTogglingLike] = useState(false);
  const [error, setError] = useState('');
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const stageWidth = Math.min(width, 720);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!postId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [postRow, commentRows] = await Promise.all([
        getCirclePost(postId),
        listCirclePostComments(postId),
      ]);
      setPost(postRow);
      setComments(commentRows);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this Circle post.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [postId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useFocusEffect(
    useCallback(() => {
      if (!postId) return undefined;
      return subscribeToCirclePostChanges({
        conversationId,
        postId,
        onChange: () => load({ quiet: true }),
      });
    }, [conversationId, load, postId])
  );

  const viewerItems = useMemo(() => (
    (post?.media || []).map((item) => ({
      ...item,
      senderName: post.authorName,
      senderAvatar: post.authorAvatar,
      messageBody: post.caption,
      createdAt: post.createdAt,
    }))
  ), [post]);

  const toggleLike = async () => {
    if (!post?.id || togglingLike) return;
    const previousLiked = Boolean(post.likedByMe);
    const previousCount = Number(post.likeCount || 0);
    setTogglingLike(true);
    setPost((current) => ({
      ...current,
      likedByMe: !previousLiked,
      likeCount: Math.max(0, previousCount + (previousLiked ? -1 : 1)),
    }));

    try {
      const result = await toggleCirclePostLike(post.id);
      setPost((current) => ({ ...current, likedByMe: result.liked, likeCount: result.likeCount }));
    } catch (likeError) {
      setPost((current) => ({ ...current, likedByMe: previousLiked, likeCount: previousCount }));
      Alert.alert('Like not updated', likeError?.message || 'Please try again.');
    } finally {
      setTogglingLike(false);
    }
  };

  const addComment = async () => {
    const body = commentText.trim();
    if (!body || commenting) return;
    setCommenting(true);
    try {
      const comment = await addCirclePostComment(postId, body);
      setComments((current) => [...current, comment]);
      setPost((current) => ({ ...current, commentCount: Number(current.commentCount || 0) + 1 }));
      setCommentText('');
    } catch (commentError) {
      Alert.alert('Comment not added', commentError?.message || 'Please try again.');
    } finally {
      setCommenting(false);
    }
  };

  const removeComment = (comment) => {
    if (!comment.canDelete) return;
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
              setPost((current) => ({
                ...current,
                commentCount: Math.max(0, Number(current.commentCount || 0) - 1),
              }));
            } catch (deleteError) {
              Alert.alert('Comment not deleted', deleteError?.message || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const deletePost = () => {
    if (!post?.canEdit || deleting) return;
    Alert.alert(
      'Delete this Circle post?',
      'The post, comments, likes, and its separately uploaded media will be removed from the Circle. Chat and Timeline messages are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Post',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteOwnCirclePost(post.id);
              navigation.goBack();
            } catch (deleteError) {
              Alert.alert('Circle post not deleted', deleteError?.message || 'Please try again.');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const showPostActions = () => {
    if (!post?.canEdit) return;
    const edit = () => navigation.navigate('EditCirclePost', {
      postId: post.id,
      conversationId: post.conversationId,
    });

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Edit Caption', 'Delete Post'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
          title: 'Circle post options',
        },
        (index) => {
          if (index === 1) edit();
          if (index === 2) deletePost();
        }
      );
      return;
    }

    Alert.alert('Circle post options', null, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit Caption', onPress: edit },
      { text: 'Delete Post', style: 'destructive', onPress: deletePost },
    ]);
  };

  const { animatedHeight: animatedMediaHeight, onScroll: onMediaScroll } = usePostCarouselHeight({
    media: post?.media || [],
    presentation: post?.presentation,
    width: stageWidth,
    activeIndex: activeMediaIndex,
  });

  const header = post ? (
    <View style={styles.postCard}>
      <View style={styles.authorRow}>
        <Pressable
          onPress={() => navigation.navigate('Profile', { userId: post.authorId })}
          style={({ pressed }) => [styles.authorIdentity, pressed && styles.pressed]}
        >
          <Avatar size={42} name={post.authorName} uri={post.authorAvatar} />
          <View style={styles.authorTextWrap}>
            <Text style={styles.authorName}>{post.authorName}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="lock-closed" size={10} color={theme.colors.subtext} />
              <Text style={styles.timestamp}>{formatTimestamp(post.createdAt)}</Text>
              {post.editedAt ? <Text style={styles.timestamp}>· Edited</Text> : null}
            </View>
          </View>
        </Pressable>

        {post.canEdit ? (
          <Pressable
            onPress={showPostActions}
            hitSlop={10}
            style={({ pressed }) => [styles.optionsButton, pressed && styles.pressed]}
          >
            {deleting ? <ActivityIndicator size="small" color={theme.circle.accent} /> : (
              <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.text} />
            )}
          </Pressable>
        ) : null}
      </View>

      <Animated.View style={{ height: animatedMediaHeight, overflow: 'hidden' }}>
      <FlatList
        horizontal
        pagingEnabled
        style={{ flexGrow: 0 }}
        data={post.media}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        onScroll={onMediaScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => {
          const offset = event.nativeEvent.contentOffset.x || 0;
          setActiveMediaIndex(Math.max(0, Math.min(post.media.length - 1, Math.round(offset / stageWidth))));
        }}
        renderItem={({ item, index }) => (
          <PostMedia
            item={item}
            size={stageWidth}
            presentation={mediaPresentationForIndex(post.presentation, index, item)}
            styles={styles}
            onPress={() => navigation.navigate('ConversationMedia', {
              items: viewerItems,
              startIndex: index,
            })}
          />
        )}
      />
      </Animated.View>

      {post.media.length > 1 ? (
        <View style={styles.mediaCountPill}>
          <Ionicons name="copy-outline" size={11} color={theme.colors.text} />
          <Text style={styles.mediaCount}>{post.media.length} items</Text>
        </View>
      ) : null}

      <View style={styles.engagementRow}>
        <Pressable
          onPress={toggleLike}
          disabled={togglingLike}
          style={({ pressed }) => [styles.engagementButton, (pressed || togglingLike) && styles.pressed]}
        >
          <Ionicons
            name={post.likedByMe ? 'heart' : 'heart-outline'}
            size={23}
            color={post.likedByMe ? '#ff5c67' : theme.colors.text}
          />
          <Text style={styles.engagementText}>{post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}</Text>
        </Pressable>

        <View style={styles.engagementButton}>
          <Ionicons name="chatbubble-outline" size={22} color={theme.colors.text} />
          <Text style={styles.engagementText}>{post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}</Text>
        </View>
      </View>

      {post.caption ? (
        <Text style={styles.caption}>
          <Text style={styles.captionAuthor}>{post.authorName} </Text>
          {post.caption}
        </Text>
      ) : null}

      <View style={styles.commentsHeading}>
        <View style={styles.commentsIcon}>
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={theme.colors.text} />
        </View>
        <Text style={styles.commentsHeadingText}>Private comments</Text>
      </View>
    </View>
  ) : null;

  if (loading && !post) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.stateText}>Opening private Circle post…</Text>
      </SafeAreaView>
    );
  }

  if (error && !post) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <View style={styles.stateIcon}>
          <Ionicons name="lock-closed-outline" size={28} color={theme.colors.text} />
        </View>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <View style={styles.contentWidth}>
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={header}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load({ quiet: true });
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<InstagramCommentsEmpty body="Keep the conversation inside this Circle." />}
            renderItem={({ item }) => (
              <InstagramCommentRow
                comment={{
                  id: item.id,
                  name: item.displayName,
                  avatarUri: item.avatarUri,
                  body: item.body,
                  timeLabel: item.createdAt ? timeAgo(item.createdAt) : '',
                  edited: Boolean(item.editedAt),
                }}
                onOpenProfile={() => navigation.navigate('Profile', { userId: item.userId })}
                onLongPress={item.canDelete ? () => removeComment(item) : undefined}
              />
            )}
          />

          <InstagramCommentComposer
            value={commentText}
            onChangeText={setCommentText}
            onSubmit={addComment}
            sending={commenting}
            placeholder="Add a private comment…"
            bottomInset={insets.bottom}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function CirclePostDetailScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CirclePostDetailContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    keyboardView: { flex: 1 },
    contentWidth: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
    listContent: { flexGrow: 1, paddingBottom: 18, backgroundColor: theme.colors.surface },
    postCard: { backgroundColor: theme.colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.circle.accentSoft },
    authorRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.divider, backgroundColor: theme.colors.surface },
    authorIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    authorTextWrap: { flex: 1, marginLeft: 10 },
    authorName: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    timestamp: { color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 10 },
    optionsButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
    mediaPage: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
    media: { width: '100%', height: '100%' },
    videoPage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' },
    videoHint: { marginTop: 8, color: 'rgba(255,255,255,0.78)', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    mediaCountPill: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.circle.accentSoft },
    mediaCount: { color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
    engagementRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 13, paddingTop: 12 },
    engagementButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5 },
    engagementText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    caption: { paddingHorizontal: 13, paddingTop: 8, color: theme.colors.text, fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 20 },
    captionAuthor: { fontFamily: 'Manrope_700Bold' },
    commentsHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 15, paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.circle.accentSoft },
    commentsIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: theme.circle.accentSoft },
    commentsHeadingText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: theme.circle.profileBackground },
    stateIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: theme.circle.accentSoft },
    stateText: { marginTop: 10, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
    errorText: { marginTop: 12, color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
    retryButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.welcome.brandInk },
    retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
    pressed: { opacity: 0.7 },
  });
}
