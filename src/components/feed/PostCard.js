import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../../theme/colors';
import { Avatar } from '../Avatar';

export function PostCard({
  post,
  onToggleLike,
  onDoubleLike,
  onOpenComments,
  onOpenPost,
  onOpenProfile,
}) {
  const [showBigHeart, setShowBigHeart] = useState(false);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef(null);
  const heartTimerRef = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(singleTapTimerRef.current);
      clearTimeout(heartTimerRef.current);
    },
    []
  );

  const onImagePress = () => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;

    if (isDoubleTap) {
      clearTimeout(singleTapTimerRef.current);
      setShowBigHeart(true);

      if (!post.liked) onDoubleLike?.();

      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium
      ).catch(() => {});

      clearTimeout(heartTimerRef.current);
      heartTimerRef.current = setTimeout(
        () => setShowBigHeart(false),
        650
      );

      lastTapRef.current = 0;
      return;
    }

    lastTapRef.current = now;
    clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      onOpenPost?.();
      lastTapRef.current = 0;
    }, 310);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={onOpenProfile}
          disabled={!onOpenProfile}
          style={styles.authorButton}
        >
          <Avatar
            size={36}
            name={post.user.name}
            uri={post.user.avatarUri}
          />

          <View style={styles.authorText}>
            <Text style={styles.authorName} numberOfLines={1}>
              {post.user.name}
            </Text>
            <Text style={styles.time}>{post.time}</Text>
          </View>
        </Pressable>

        <Pressable hitSlop={10}>
          <Ionicons
            name="ellipsis-horizontal"
            size={18}
            color="#888"
          />
        </Pressable>
      </View>

      <Pressable
        onPress={onImagePress}
        style={styles.mediaButton}
      >
        <View style={styles.mediaWrap}>
          <Image
            source={{ uri: post.uri }}
            style={styles.media}
            resizeMode="cover"
          />

          {showBigHeart ? (
            <View style={styles.heartOverlay}>
              <MotiView
                from={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1.1, opacity: 1 }}
                transition={{ type: 'timing', duration: 350 }}
              >
                <Ionicons
                  name="heart"
                  size={96}
                  color="#fff"
                  style={styles.largeHeart}
                />
              </MotiView>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          onPress={onToggleLike}
          hitSlop={10}
          style={styles.actionButton}
        >
          <Ionicons
            name={post.liked ? 'heart' : 'heart-outline'}
            size={26}
            color={post.liked ? '#e11d48' : COLORS.text}
          />
        </Pressable>

        <Pressable
          onPress={onOpenComments}
          hitSlop={10}
          style={styles.actionButton}
        >
          <Ionicons
            name="chatbubble-outline"
            size={24}
            color={COLORS.text}
          />
        </Pressable>

        <Pressable hitSlop={10} style={styles.actionButton}>
          <Ionicons
            name="paper-plane-outline"
            size={24}
            color={COLORS.text}
          />
        </Pressable>
      </View>

      <View style={styles.details}>
        <Text style={styles.likes}>{post.likes} likes</Text>

        {post.caption ? (
          <Pressable onPress={onOpenPost}>
            <Text style={styles.caption} numberOfLines={3}>
              <Text style={styles.captionName}>
                {post.user.name}{' '}
              </Text>
              <Text style={styles.captionBody}>{post.caption}</Text>
            </Text>
          </Pressable>
        ) : null}

        <Pressable onPress={onOpenComments}>
          <Text style={styles.commentsLink}>View comments</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  authorButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorText: {
    marginLeft: 10,
    flex: 1,
  },
  authorName: {
    fontFamily: 'Manrope_700Bold',
    color: COLORS.text,
  },
  time: {
    fontFamily: 'Manrope_400Regular',
    color: '#888',
    fontSize: 12,
  },
  mediaButton: {
    backgroundColor: '#f2f2f2',
  },
  mediaWrap: {
    width: '100%',
    aspectRatio: 1,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeHeart: {
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionButton: {
    marginRight: 16,
  },
  details: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  likes: {
    fontFamily: 'Manrope_700Bold',
    color: COLORS.text,
  },
  caption: {
    marginTop: 4,
    color: COLORS.text,
  },
  captionName: {
    fontFamily: 'Manrope_700Bold',
  },
  captionBody: {
    fontFamily: 'Manrope_400Regular',
  },
  commentsLink: {
    color: '#6b6b6b',
    marginTop: 6,
    fontFamily: 'Manrope_400Regular',
  },
});
