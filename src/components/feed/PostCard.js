import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { Avatar } from '../Avatar';
import { PostMediaCarousel } from './PostMediaCarousel';

const COLLAPSED_CAPTION_LENGTH = 120;

function commentsLabel(count, isCirclePost) {
  if (!count) return isCirclePost ? 'Add a private comment' : 'Add a comment';
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
  onOpenCircle,
  onOpenMenu,
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const isCirclePost = post.sourceType === 'circle' && post.circle?.id;

  useEffect(() => {
    setCaptionExpanded(false);
  }, [post.feedKey || post.id]);

  const captionNeedsCollapse =
    post.caption.length > COLLAPSED_CAPTION_LENGTH;

  const visibleCaption =
    captionNeedsCollapse && !captionExpanded
      ? `${post.caption.slice(0, COLLAPSED_CAPTION_LENGTH).trimEnd()}…`
      : post.caption;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.identityCluster}>
          <Pressable
            onPress={onOpenProfile}
            disabled={!onOpenProfile}
            hitSlop={6}
          >
            <Avatar
              size={38}
              name={post.user.name}
              uri={post.user.avatarUri}
            />
          </Pressable>

          <View style={styles.authorText}>
            <Pressable
              onPress={onOpenProfile}
              disabled={!onOpenProfile}
              hitSlop={4}
              style={styles.authorNameButton}
            >
              <Text style={styles.authorName} numberOfLines={1}>
                {post.user.name}
              </Text>
            </Pressable>

            {isCirclePost ? (
              <View style={styles.circleContextRow}>
                <Ionicons
                  name="ellipse-outline"
                  size={12}
                  color={theme.circle.accent}
                />
                <Text style={styles.contextPrefix}>in</Text>
                <Pressable
                  onPress={onOpenCircle}
                  disabled={!onOpenCircle}
                  hitSlop={5}
                  style={styles.circleNameButton}
                >
                  <Text style={styles.circleName} numberOfLines={1}>
                    {post.circle.name}
                  </Text>
                </Pressable>
                <Ionicons
                  name="lock-closed"
                  size={9}
                  color={theme.colors.subtext}
                  style={styles.contextLock}
                />
                <Text style={styles.contextTime}>· {post.time}</Text>
              </View>
            ) : (
              <Text style={styles.time}>{post.time}</Text>
            )}
          </View>
        </View>

        {onOpenMenu ? (
          <Pressable
            onPress={onOpenMenu}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={isCirclePost ? 'Manage Circle post' : 'Manage post'}
            style={styles.menuButton}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={theme.colors.text}
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
        presentation={post.presentation}
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
            color={post.liked ? '#ff3b30' : theme.colors.text}
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
            color={theme.colors.text}
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
            {commentsLabel(post.commentCount, isCirclePost)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  identityCluster: {
    flex: 1,
    minWidth: 0,
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
    minWidth: 0,
  },
  authorNameButton: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  authorName: {
    fontFamily: 'Manrope_700Bold',
    color: theme.colors.text,
  },
  time: {
    marginTop: 1,
    fontFamily: 'Manrope_400Regular',
    color: theme.colors.subtext,
    fontSize: 12,
  },
  circleContextRow: {
    marginTop: 2,
    minHeight: 17,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  contextPrefix: {
    marginLeft: 4,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
  },
  circleNameButton: {
    marginLeft: 3,
    flexShrink: 1,
  },
  circleName: {
    color: theme.circle.accent,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11.5,
  },
  contextLock: {
    marginLeft: 5,
  },
  contextTime: {
    marginLeft: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
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
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  mediaCount: {
    marginLeft: 'auto',
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  details: {
    paddingHorizontal: 12,
    paddingBottom: 13,
  },
  caption: {
    color: theme.colors.text,
  },
  captionName: {
    fontFamily: 'Manrope_700Bold',
  },
  captionBody: {
    fontFamily: 'Manrope_400Regular',
  },
  moreText: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
  },
  commentsLink: {
    color: theme.colors.subtext,
    marginTop: 7,
    fontFamily: 'Manrope_400Regular',
  },
  });
}
