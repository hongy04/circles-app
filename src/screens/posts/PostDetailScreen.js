import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Video } from 'expo-av';
import { COLORS } from '../../theme/colors';
import { Avatar } from '../../components/Avatar';
import { togglePostLike } from '../../services/feedService';
import { fetchPostDetail } from '../../services/postService';
import { timeAgo } from '../../utils/timeAgo';

export function PostDetailScreen({ route, navigation }) {
  const { postId } = route.params || {};
  const { width } = useWindowDimensions();
  const [post, setPost] = useState(null);
  const [author, setAuthor] = useState(null);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [liking, setLiking] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const mountedRef = useRef(true);

  const mediaWidth = Math.min(width, 720);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const detail = await fetchPostDetail(postId);

      if (!mountedRef.current) return;

      setPost(detail.post);
      setAuthor(detail.author);
      setMedia(detail.media);
      setLikes(detail.likes);
      setLiked(detail.likedByMe);
      setActiveMediaIndex(0);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(
        loadError?.message || 'The post could not be loaded.'
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();

    return () => {
      mountedRef.current = false;
    };
  }, [postId]);

  const onToggleLike = async () => {
    if (liking) return;

    const previousLiked = liked;
    const previousLikes = likes;
    const nextLiked = !previousLiked;

    setLiking(true);
    setLiked(nextLiked);
    setLikes(
      Math.max(0, previousLikes + (nextLiked ? 1 : -1))
    );

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

  const displayMedia = media.length
    ? media
    : post?.image_url
      ? [
          {
            id: 'primary-image',
            url: post.image_url,
            media_type: 'image',
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
        <Ionicons
          name="alert-circle-outline"
          size={34}
          color={COLORS.subtext}
        />
        <Text style={styles.errorTitle}>Post unavailable</Text>
        <Text style={styles.errorBody}>
          {error || 'The post could not be found.'}
        </Text>
        <View style={styles.errorActions}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Go back</Text>
          </Pressable>
          <Pressable onPress={load} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={COLORS.text}
          />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
        <Pressable hitSlop={10}>
          <Ionicons
            name="ellipsis-horizontal"
            size={22}
            color={COLORS.text}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { maxWidth: mediaWidth }]}>
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
              <Text style={styles.timestamp}>
                {timeAgo(post.created_at)}
              </Text>
            </View>
          </Pressable>

          <View style={styles.mediaSection}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const offset =
                  event.nativeEvent.contentOffset.x || 0;
                setActiveMediaIndex(
                  Math.round(offset / mediaWidth)
                );
              }}
              style={{ width: mediaWidth }}
            >
              {displayMedia.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.mediaSlide,
                    { width: mediaWidth },
                  ]}
                >
                  {item.media_type === 'video' ? (
                    <Video
                      source={{ uri: item.url }}
                      style={styles.media}
                      resizeMode="contain"
                      shouldPlay={activeMediaIndex === index}
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
              ))}
            </ScrollView>

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

            <Pressable hitSlop={10} style={styles.actionButton}>
              <Ionicons
                name="chatbubble-outline"
                size={26}
                color={COLORS.text}
              />
            </Pressable>

            <Pressable hitSlop={10} style={styles.actionButton}>
              <Ionicons
                name="paper-plane-outline"
                size={26}
                color={COLORS.text}
              />
            </Pressable>
          </View>

          <View style={styles.details}>
            <Text style={styles.likes}>{likes} likes</Text>

            {post.caption ? (
              <Text style={styles.caption}>
                <Text style={styles.captionName}>
                  {author?.display_name || 'Unknown'}{' '}
                </Text>
                <Text style={styles.captionBody}>
                  {post.caption}
                </Text>
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
    color: COLORS.text,
  },
  content: {
    paddingBottom: 30,
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
    paddingBottom: 16,
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
});
