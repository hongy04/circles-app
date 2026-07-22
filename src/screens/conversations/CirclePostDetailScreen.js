import React, { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
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
import { COLORS } from '../../theme/colors';
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

function PostMedia({ item, size, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.mediaPage,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
    >
      {item.mediaType === 'image' ? (
        <Image
          source={{ uri: item.url }}
          style={styles.media}
          resizeMode="contain"
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

export function CirclePostDetailScreen({ route, navigation }) {
  const { postId, conversationId } = route.params || {};
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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

  const addComment = async () => {
    const body = commentText.trim();
    if (!body || commenting) return;

    setCommenting(true);
    try {
      const comment = await addCirclePostComment(postId, body);
      setComments((current) => [...current, comment]);
      setPost((current) => ({
        ...current,
        commentCount: Number(current.commentCount || 0) + 1,
      }));
      setCommentText('');
    } catch (commentError) {
      Alert.alert(
        'Comment not added',
        commentError?.message || 'Please try again.'
      );
    } finally {
      setCommenting(false);
    }
  };

  const removeComment = async (comment) => {
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
              setComments((current) =>
                current.filter((item) => item.id !== comment.id)
              );
              setPost((current) => ({
                ...current,
                commentCount: Math.max(0, Number(current.commentCount || 0) - 1),
              }));
            } catch (deleteError) {
              Alert.alert(
                'Comment not deleted',
                deleteError?.message || 'Please try again.'
              );
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
              Alert.alert(
                'Circle post not deleted',
                deleteError?.message || 'Please try again.'
              );
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

  const header = post ? (
    <View>
      <View style={styles.authorRow}>
        <Pressable
          onPress={() => navigation.navigate('Profile', { userId: post.authorId })}
          style={({ pressed }) => [styles.authorIdentity, pressed && styles.pressed]}
        >
          <Avatar
            size={42}
            name={post.authorName}
            uri={post.authorAvatar}
          />
          <View style={styles.authorTextWrap}>
            <Text style={styles.authorName}>{post.authorName}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="lock-closed" size={10} color={COLORS.subtext} />
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
            {deleting ? (
              <ActivityIndicator size="small" />
            ) : (
              <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.text} />
            )}
          </Pressable>
        ) : null}
      </View>

      <FlatList
        horizontal
        pagingEnabled
        data={post.media}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <PostMedia
            item={item}
            size={stageWidth}
            onPress={() => navigation.navigate('ConversationMedia', {
              items: viewerItems,
              startIndex: index,
            })}
          />
        )}
      />

      {post.media.length > 1 ? (
        <Text style={styles.mediaCount}>{post.media.length} items</Text>
      ) : null}

      <View style={styles.engagementRow}>
        <View style={styles.engagementButton}>
          <Ionicons name="chatbubble-outline" size={22} color={COLORS.text} />
          <Text style={styles.engagementText}>
            {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
          </Text>
        </View>
      </View>

      {post.caption ? (
        <Text style={styles.caption}>
          <Text style={styles.captionAuthor}>{post.authorName} </Text>
          {post.caption}
        </Text>
      ) : null}

      <View style={styles.commentsDivider} />
    </View>
  ) : null;

  if (loading && !post) {
    return (
      <SafeAreaView edges={[]} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening private Circle post…</Text>
      </SafeAreaView>
    );
  }

  if (error && !post) {
    return (
      <SafeAreaView edges={[]} style={styles.centerState}>
        <Ionicons name="lock-closed-outline" size={36} color={COLORS.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
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
            style={styles.commentsList}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={(
              <InstagramCommentsEmpty
                body="Keep the conversation inside this Circle."
              />
            )}
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
                onOpenProfile={() => navigation.navigate('Profile', {
                  userId: item.userId,
                })}
                onLongPress={item.canDelete
                  ? () => removeComment(item)
                  : undefined}
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

const styles = StyleSheet.create({
  screen: {
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
  commentsList: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 18,
  },
  authorRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  authorIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  authorName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  timestamp: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  optionsButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  videoPage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1c1e',
  },
  videoHint: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.78)',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  mediaCount: {
    alignSelf: 'center',
    marginTop: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 13,
    paddingTop: 12,
  },
  engagementButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  engagementText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  caption: {
    paddingHorizontal: 13,
    paddingTop: 8,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  captionAuthor: {
    fontFamily: 'Manrope_700Bold',
  },
  commentsDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
    backgroundColor: COLORS.border,
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
