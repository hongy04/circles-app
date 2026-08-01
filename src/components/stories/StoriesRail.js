import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { getInitials } from '../../utils/getInitials';

function StoryAvatar({ story, seen }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View
      style={[
        styles.ring,
        seen ? styles.seenRing : styles.unseenRing,
      ]}
    >
      <View style={styles.avatarInner}>
        {story?.avatar ? (
          <Image source={{ uri: story.avatar }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.initials}>
            {getInitials(story?.userName || 'You')}
          </Text>
        )}
      </View>
    </View>
  );
}

export function StoriesRail({
  stories,
  onAddYourStory,
  onOpen,
  seenStoryUserIds = new Set(),
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const ownIndex = stories.findIndex((story) => story.isMine);
  const ownStory = ownIndex >= 0 ? stories[ownIndex] : null;

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.item}>
          <Pressable
            onPress={() =>
              ownStory ? onOpen(ownIndex) : onAddYourStory()
            }
            accessibilityRole="button"
            accessibilityLabel={
              ownStory ? 'View your story' : 'Add your story'
            }
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            {ownStory ? (
              <StoryAvatar
                story={ownStory}
                seen={seenStoryUserIds.has(ownStory.userId)}
              />
            ) : (
              <View style={[styles.ring, styles.emptyRing]}>
                <View style={styles.emptyAvatar}>
                  <Ionicons
                    name="person-outline"
                    size={25}
                    color={theme.colors.subtext}
                  />
                </View>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={onAddYourStory}
            accessibilityRole="button"
            accessibilityLabel="Add another story"
            hitSlop={8}
            style={({ pressed }) => [
              styles.addBadge,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={16} color={theme.colors.onPrimary} />
          </Pressable>

          <Text numberOfLines={1} style={styles.label}>
            Your Story
          </Text>
        </View>

        {stories.map((story, index) => {
          if (story.isMine) return null;

          return (
            <Pressable
              key={story.userId}
              onPress={() => onOpen(index)}
              accessibilityRole="button"
              accessibilityLabel={`View ${story.userName}'s story`}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.pressed,
              ]}
            >
              <StoryAvatar
                story={story}
                seen={seenStoryUserIds.has(story.userId)}
              />

              <Text numberOfLines={1} style={styles.label}>
                {story.userName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  root: {
    paddingVertical: 10,
  },
  content: {
    paddingHorizontal: 12,
  },
  item: {
    position: 'relative',
    width: 72,
    alignItems: 'center',
    marginRight: 10,
  },
  ring: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 33,
    borderWidth: 2,
  },
  unseenRing: {
    borderColor: theme.circle.accent,
  },
  seenRing: {
    borderColor: theme.colors.border,
  },
  emptyRing: {
    borderColor: theme.colors.border,
  },
  avatarInner: {
    width: 58,
    height: 58,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: theme.colors.surfaceSoft,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  initials: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
  },
  emptyAvatar: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: theme.colors.surfaceSoft,
  },
  addBadge: {
    position: 'absolute',
    top: 43,
    right: 1,
    width: 23,
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    backgroundColor: theme.circle.accent,
  },
  label: {
    maxWidth: 72,
    marginTop: 6,
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  });
}
