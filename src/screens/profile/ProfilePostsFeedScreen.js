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
import { fetchProfilePage } from '../../services/profileService';
import { fetchPostDetail } from '../../services/postService';
import {
  addPostComment,
  fetchPostComments,
  togglePostLike,
} from '../../services/feedService';

function normalizeMedia(detail) {
  const rows = detail?.media || [];
  if (rows.length) {
    return rows.map((item) => ({
      id: item.id,
      url: item.url,
      mediaType: item.media_type === 'video' ? 'video' : 'image',
    }));
  }

  if (!detail?.post?.image_url) return [];
  return [{
    id: `fallback-${detail.post.id}`,
    url: detail.post.image_url,
    mediaType: /\.(mp4|mov|m4v)(?:$|\?)/i.test(detail.post.image_url)
      ? 'video'
      : 'image',
  }];
}

function mapDetail(detail) {
  return {
    id: detail.post.id,
    authorId: detail.author.id,
    authorName: detail.author.display_name || 'Unknown',
    authorAvatar: detail.author.avatar_url || null,
    caption: detail.post.caption || '',
    createdAt: detail.post.created_at,
    media: normalizeMedia(detail),
    likes: Number(detail.likes || 0),
    commentCount: Number(detail.commentCount || 0),
    liked: Boolean(detail.likedByMe),
  };
}

function mapPersonalComment(comment) {
  return {
    id: comment.id,
    userId: comment.userId || null,
    name: comment.userName || 'Someone',
    avatarUri: comment.avatarUri || null,
    body: comment.text || '',
    timeLabel: timeAgo(comment.createdAt),
    canDelete: false,
  };
}

function PersonalPostFeedCard({
  post,
  width,
  height,
  onOpenDetail,
  onOpenComments,
  onOpenProfile,
  onToggleLike,
}) {
  return (
    <View style={[styles.card, { height }]}> 
      <Pressable onPress={onOpenProfile} style={styles.authorRow}>
        <Avatar
          size={40}
          name={post.authorName}
          uri={post.authorAvatar}
        />
        <View style={styles.authorText}>
          <Text style={styles.authorName} numberOfLines={1}>
            {post.authorName}
          </Text>
          <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.text} />
      </Pressable>

      <FlatList
        horizontal
        style={{ height: width, flexGrow: 0 }}
        pagingEnabled
        data={post.media}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={onOpenDetail}
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
        <Pressable onPress={onToggleLike} hitSlop={10} style={styles.actionButton}>
          <Ionicons
            name={post.liked ? 'heart' : 'heart-outline'}
            size={27}
            color={post.liked ? '#e11d48' : COLORS.text}
          />
        </Pressable>
        <Pressable onPress={onOpenComments} hitSlop={10} style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={25} color={COLORS.text} />
        </Pressable>
        {post.media.length > 1 ? (
          <Text style={styles.mediaCount}>{post.media.length} items</Text>
        ) : null}
      </View>

      <View style={styles.details}>
        <Text style={styles.likes}>
          {post.likes} {post.likes === 1 ? 'like' : 'likes'}
        </Text>
        {post.caption ? (
          <Text numberOfLines={2} style={styles.caption}>
            <Text style={styles.captionAuthor}>{post.authorName} </Text>
            {post.caption}
          </Text>
        ) : null}
        <Pressable onPress={onOpenComments} style={styles.commentsButton}>
          <Text style={styles.commentsLink}>
            {post.commentCount
              ? `View all ${post.commentCount} ${post.commentCount === 1 ? 'comment' : 'comments'}`
              : 'Add a comment'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ProfilePostsFeedScreen({ route, navigation }) {
  const { userId, profileName, initialPostId } = route.params || {};
  const { width } = useWindowDimensions();
  const stageWidth = Math.min(width, 720);
  const cardHeight = stageWidth + 212;
  const [posts, setPosts] = useState([]);
  const [resolvedName, setResolvedName] = useState(profileName || 'Posts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentsPost, setCommentsPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const page = await fetchProfilePage(userId);
      setResolvedName(page.profile?.display_name || profileName || 'Posts');

      const results = await Promise.allSettled(
        (page.posts || []).map((post) => fetchPostDetail(post.id))
      );
      setPosts(
        results
          .filter((result) => result.status === 'fulfilled')
          .map((result) => mapDetail(result.value))
      );
    } catch (loadError) {
      setError(loadError?.message || 'Could not load these posts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profileName, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const initialIndex = useMemo(() => {
    const index = posts.findIndex((post) => post.id === initialPostId);
    return index >= 0 ? index : 0;
  }, [initialPostId, posts]);

  const toggleLike = async (postId) => {
    const existing = posts.find((post) => post.id === postId);
    if (!existing) return;

    setPosts((current) => current.map((post) => (
      post.id === postId
        ? {
            ...post,
            liked: !post.liked,
            likes: Math.max(0, post.likes + (post.liked ? -1 : 1)),
          }
        : post
    )));

    try {
      await togglePostLike(postId);
    } catch (likeError) {
      setPosts((current) => current.map((post) => (
        post.id === postId ? existing : post
      )));
      Alert.alert('Like not saved', likeError?.message || 'Please try again.');
    }
  };

  const loadComments = useCallback(async (postId, { quiet = false } = {}) => {
    if (!postId) return;
    if (!quiet) setCommentsLoading(true);
    setCommentsError('');

    try {
      const rows = await fetchPostComments(postId);
      setComments(rows.map(mapPersonalComment));
      setPosts((current) => current.map((post) => (
        post.id === postId ? { ...post, commentCount: rows.length } : post
      )));
      setCommentsPost((current) => (
        current?.id === postId ? { ...current, commentCount: rows.length } : current
      ));
    } catch (loadError) {
      setCommentsError(loadError?.message || 'Comments could not be loaded.');
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const openComments = (post) => {
    setCommentsPost(post);
    setComments([]);
    setCommentsError('');
    setCommentsVisible(true);
    loadComments(post.id);
  };

  const submitComment = async (body) => {
    if (!commentsPost?.id) return;
    await addPostComment(commentsPost.id, body);
    await loadComments(commentsPost.id, { quiet: true });
  };

  const openCommentAuthor = (commentUserId) => {
    setCommentsVisible(false);
    setTimeout(() => {
      navigation.navigate('Profile', { userId: commentUserId });
    }, 180);
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening posts…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBarButton}>
          <Ionicons name="chevron-back" size={25} color={COLORS.text} />
        </Pressable>
        <View style={styles.topBarTitleWrap}>
          <Text style={styles.topBarEyebrow}>Posts</Text>
          <Text style={styles.topBarTitle} numberOfLines={1}>{resolvedName}</Text>
        </View>
        <View style={styles.topBarButton} />
      </View>

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
            <PersonalPostFeedCard
              post={item}
              width={stageWidth}
              height={cardHeight}
              onOpenDetail={() => navigation.navigate('PostDetail', { postId: item.id })}
              onOpenComments={() => openComments(item)}
              onOpenProfile={() => navigation.navigate('Profile', { userId: item.authorId })}
              onToggleLike={() => toggleLike(item.id)}
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
              <Ionicons name="images-outline" size={38} color={COLORS.subtext} />
              <Text style={styles.errorText}>No posts to scroll through yet.</Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      <InstagramCommentsSheet
        visible={commentsVisible}
        title="Comments"
        subtitle={commentsPost ? `${commentsPost.authorName}'s post` : undefined}
        comments={comments}
        loading={commentsLoading}
        error={commentsError}
        onClose={() => setCommentsVisible(false)}
        onRetry={() => loadComments(commentsPost?.id)}
        onSubmit={submitComment}
        onOpenProfile={openCommentAuthor}
        emptyBody="Be the first to leave a comment."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  topBar: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 8,
  },
  topBarButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitleWrap: { flex: 1, alignItems: 'center' },
  topBarEyebrow: {
    fontFamily: 'Manrope_400Regular',
    color: COLORS.subtext,
    fontSize: 10,
  },
  topBarTitle: {
    fontFamily: 'Manrope_700Bold',
    color: COLORS.text,
    fontSize: 15,
  },
  listContent: { paddingBottom: 34 },
  card: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    backgroundColor: COLORS.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  authorRow: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  authorText: { flex: 1, marginLeft: 10 },
  authorName: { fontFamily: 'Manrope_700Bold', color: COLORS.text },
  time: { marginTop: 2, fontFamily: 'Manrope_400Regular', color: COLORS.subtext, fontSize: 11 },
  mediaPage: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  videoPage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' },
  actionRow: { height: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  actionButton: { marginRight: 17 },
  mediaCount: { marginLeft: 'auto', color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  details: { paddingHorizontal: 12, paddingBottom: 16 },
  likes: { fontFamily: 'Manrope_700Bold', color: COLORS.text, fontSize: 13 },
  caption: { marginTop: 5, color: COLORS.text, fontFamily: 'Manrope_400Regular', lineHeight: 19 },
  captionAuthor: { fontFamily: 'Manrope_700Bold' },
  commentsButton: { alignSelf: 'flex-start', paddingTop: 6, paddingBottom: 8, paddingRight: 18 },
  commentsLink: { color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 13 },
  centerState: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: COLORS.bg },
  stateText: { marginTop: 10, color: COLORS.subtext, fontFamily: 'Manrope_400Regular' },
  errorText: { marginTop: 12, color: COLORS.text, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.primary },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
});
