import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import { Avatar } from '../Avatar';
import { PostMediaCarousel } from './PostMediaCarousel';

const COLLAPSED_CAPTION_LENGTH = 120;

function commentsLabel(count) {
  if (!count) return 'Add a comment';
  return `View all ${count} ${count === 1 ? 'comment' : 'comments'}`;
}

export function PostCard({
  post,
  isVisible = false,
  onToggleLike,
  onDoubleLike,
  onOpenComments,
  onOpenPost,
  onOpenProfile,
  onOpenMenu,
}) {
  const [captionExpanded, setCaptionExpanded] = useState(false);

  useEffect(() => {
    setCaptionExpanded(false);
  }, [post.id]);

  const captionNeedsCollapse =
    post.caption.length > COLLAPSED_CAPTION_LENGTH;

  const visibleCaption =
    captionNeedsCollapse && !captionExpanded
      ? `${post.caption.slice(0, COLLAPSED_CAPTION_LENGTH).trimEnd()}…`
      : post.caption;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={onOpenProfile}
          disabled={!onOpenProfile}
          style={styles.authorButton}
        >
          <Avatar
            size={38}
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

        {onOpenMenu ? (
          <Pressable
            onPress={onOpenMenu}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Manage post"
            style={styles.menuButton}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={COLORS.text}
            />
          </Pressable>
        ) : (
          <View style={styles.menuButton} />
        )}
      </View>

      <PostMediaCarousel
        media={post.media}
        liked={post.liked}
        isVisible={isVisible}
        onOpenPost={onOpenPost}
        onDoubleLike={onDoubleLike}
      />

      <View style={styles.actionRow}>
        <Pressable
          onPress={onToggleLike}
          hitSlop={10}
          style={styles.actionButton}
        >
          <Ionicons
            name={post.liked ? 'heart' : 'heart-outline'}
            size={26}
            color={post.liked ? '#ff3b30' : COLORS.text}
          />
        </Pressable>
        <Text style={styles.engagementCount}>
          {post.likes} {post.likes === 1 ? 'like' : 'likes'}
        </Text>

        <Pressable
          onPress={onOpenComments}
          hitSlop={10}
          style={styles.commentActionButton}
        >
          <Ionicons
            name="chatbubble-outline"
            size={24}
            color={COLORS.text}
          />
        </Pressable>
        <Text style={styles.engagementCount}>
          {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
        </Text>

        {post.media.length > 1 ? (
          <Text style={styles.mediaCount}>{post.media.length} items</Text>
        ) : null}
      </View>

      <View style={styles.details}>
        {post.caption ? (
          <Text style={styles.caption}>
            <Text
              style={styles.captionName}
              onPress={onOpenProfile}
            >
              {post.user.name}{' '}
            </Text>
            <Text style={styles.captionBody}>{visibleCaption}</Text>
            {captionNeedsCollapse ? (
              <Text
                style={styles.moreText}
                onPress={() =>
                  setCaptionExpanded((current) => !current)
                }
              >
                {captionExpanded ? ' less' : ' more'}
              </Text>
            ) : null}
          </Text>
        ) : null}

        <Pressable onPress={onOpenComments}>
          <Text style={styles.commentsLink}>
            {commentsLabel(post.commentCount)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  authorButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 1,
    fontFamily: 'Manrope_400Regular',
    color: '#888',
    fontSize: 12,
  },
  actionRow: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  actionButton: {
    marginRight: 6,
  },
  commentActionButton: {
    marginLeft: 15,
    marginRight: 6,
  },
  engagementCount: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  mediaCount: {
    marginLeft: 'auto',
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  details: {
    paddingHorizontal: 12,
    paddingBottom: 13,
  },
  caption: {
    color: COLORS.text,
  },
  captionName: {
    fontFamily: 'Manrope_700Bold',
  },
  captionBody: {
    fontFamily: 'Manrope_400Regular',
  },
  moreText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
  },
  commentsLink: {
    color: COLORS.subtext,
    marginTop: 7,
    fontFamily: 'Manrope_400Regular',
  },
});
