import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { InstagramCommentsSheet } from '../../components/comments/InstagramCommentsSheet';
import { COLORS } from '../../theme/colors';
import { timeAgo } from '../../utils/timeAgo';
import {
  addCirclePostComment,
  deleteOwnCirclePostComment,
  listCirclePostComments,
  listCirclePosts,
  subscribeToCirclePostChanges,
} from '../../services/circlePostService';

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

function CirclePostFeedCard({
  post,
  width,
  height,
  navigation,
  conversationId,
  onOpenComments,
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

  const openDetail = () => navigation.navigate('CirclePostDetail', {
    conversationId,
    postId: post.id,
  });

  return (
    <View style={[styles.card, { height }]}> 
      <View style={styles.authorRow}>
        <Pressable
          onPress={() => navigation.navigate('Profile', { userId: post.authorId })}
          style={styles.authorIdentity}
        >
          <Avatar size={40} name={post.authorName} uri={post.authorAvatar} />
          <View style={styles.authorText}>
            <Text style={styles.authorName} numberOfLines={1}>{post.authorName}</Text>
            <View style={styles.privateTimeRow}>
              <Ionicons name="lock-closed" size={10} color={COLORS.subtext} />
              <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
            </View>
          </View>
        </Pressable>
        <Pressable onPress={openDetail} hitSlop={10} style={styles.optionsButton}>
          <Ionicons name="ellipsis-horizontal" size={21} color={COLORS.text} />
        </Pressable>
      </View>

      <FlatList
        horizontal
        style={{ height: width, flexGrow: 0 }}
        pagingEnabled
        data={post.media}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => navigation.navigate('ConversationMedia', {
              items: viewerItems,
              startIndex: index,
            })}
            style={[styles.mediaPage, { width, height: width }]}
          >
            {item.mediaType === 'image' ? (
              <Image source={{ uri: item.url }} style={styles.media} resizeMode="cover" />
            ) : (
              <View style={styles.videoPage}>
                <Ionicons name="play-circle" size={62} color="#fff" />
              </View>
            )}
          </Pressable>
        )}
      />

      <View style={styles.actionRow}>
        <Pressable onPress={onOpenComments} hitSlop={10} style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={25} color={COLORS.text} />
        </Pressable>
        <Text style={styles.commentCount}>
          {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
        </Text>
        {post.media.length > 1 ? (
          <Text style={styles.mediaCount}>{post.media.length} items</Text>
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

export function CirclePostsFeedScreen({ route, navigation }) {
  const { conversationId, initialPostId, circleName } = route.params || {};
  const { width } = useWindowDimensions();
  const stageWidth = Math.min(width, 720);
  const cardHeight = stageWidth + 210;
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentsPost, setCommentsPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');

  const load = useCallback(async ({ refresh = false, quiet = false } = {}) => {
    if (refresh) setRefreshing(true);
    else if (!quiet) setLoading(true);
    setError('');

    try {
      const rows = await listCirclePosts(conversationId);
      setPosts(rows);
      setCommentsPost((current) => {
        if (!current) return current;
        return rows.find((post) => post.id === current.id) || current;
      });
    } catch (loadError) {
      setError(loadError?.message || 'Could not load Circle posts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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
      load();
      return subscribeToCirclePostChanges({
        conversationId,
        onChange: () => {
          load({ quiet: true });
          if (commentsPost?.id) {
            loadComments(commentsPost.id, { quiet: true });
          }
        },
      });
    }, [commentsPost?.id, conversationId, load, loadComments])
  );

  const initialIndex = useMemo(() => {
    const index = posts.findIndex((post) => post.id === initialPostId);
    return index >= 0 ? index : 0;
  }, [initialPostId, posts]);

  const openComments = (post) => {
    setCommentsPost(post);
    setComments([]);
    setCommentsError('');
    setCommentsVisible(true);
    loadComments(post.id);
  };

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

  const openCommentAuthor = (commentUserId) => {
    setCommentsVisible(false);
    setTimeout(() => {
      navigation.navigate('Profile', { userId: commentUserId });
    }, 180);
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening Circle posts…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      {circleName ? (
        <View style={styles.contextBar}>
          <Ionicons name="lock-closed" size={11} color={COLORS.subtext} />
          <Text style={styles.contextText} numberOfLines={1}>
            {circleName} · private Circle posts
          </Text>
        </View>
      ) : null}

      {error && !posts.length ? (
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={36} color={COLORS.subtext} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          key={`${initialIndex}-${posts.length}`}
          data={posts}
          keyExtractor={(item) => item.id}
          initialScrollIndex={posts.length ? initialIndex : undefined}
          getItemLayout={(_, index) => ({
            length: cardHeight,
            offset: cardHeight * index,
            index,
          })}
          renderItem={({ item }) => (
            <CirclePostFeedCard
              post={item}
              width={stageWidth}
              height={cardHeight}
              navigation={navigation}
              conversationId={conversationId}
              onOpenComments={() => openComments(item)}
            />
          )}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ refresh: true })}
              tintColor={COLORS.text}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.centerState}>
              <Ionicons name="albums-outline" size={38} color={COLORS.subtext} />
              <Text style={styles.errorText}>No Circle posts yet.</Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  contextBar: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  contextText: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  listContent: { paddingBottom: 34 },
  card: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    backgroundColor: COLORS.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  authorRow: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  authorIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  authorText: { flex: 1, marginLeft: 10 },
  authorName: { fontFamily: 'Manrope_700Bold', color: COLORS.text },
  privateTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  time: { fontFamily: 'Manrope_400Regular', color: COLORS.subtext, fontSize: 11 },
  optionsButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  mediaPage: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  videoPage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' },
  actionRow: { height: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  actionButton: { marginRight: 7 },
  commentCount: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  mediaCount: { marginLeft: 'auto', color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  details: { paddingHorizontal: 12, paddingBottom: 16 },
  caption: { color: COLORS.text, fontFamily: 'Manrope_400Regular', lineHeight: 19 },
  captionAuthor: { fontFamily: 'Manrope_700Bold' },
  commentsButton: { alignSelf: 'flex-start', paddingTop: 6, paddingBottom: 8, paddingRight: 18 },
  commentsLink: { color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 13 },
  centerState: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: COLORS.bg },
  stateText: { marginTop: 10, color: COLORS.subtext, fontFamily: 'Manrope_400Regular' },
  errorText: { marginTop: 12, color: COLORS.text, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.primary },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
});
