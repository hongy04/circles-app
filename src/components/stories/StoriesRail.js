import React from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import { getInitials } from '../../utils/getInitials';

export function StoriesRail({ stories, onAddYourStory, onOpen }) {
  return (
    <View style={{ paddingVertical: 10 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12 }}
      >
        <Pressable
          onPress={onAddYourStory}
          style={{ alignItems: 'center', marginRight: 14 }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              borderWidth: 2,
              borderColor: COLORS.primary,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f6f6f6',
            }}
          >
            <Ionicons name="add" size={28} color={COLORS.primary} />
          </View>

          <Text
            style={{
              fontFamily: 'Manrope_600SemiBold',
              fontSize: 12,
              marginTop: 6,
              color: COLORS.text,
            }}
          >
            Your Story
          </Text>
        </Pressable>

        {stories.map((story, index) => (
          <Pressable
            key={story.userId}
            onPress={() => onOpen(index)}
            style={{ alignItems: 'center', marginRight: 14 }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                borderWidth: 2,
                borderColor: COLORS.primary,
                overflow: 'hidden',
              }}
            >
              {story.avatar ? (
                <Image
                  source={{ uri: story.avatar }}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: 'Manrope_700Bold' }}>
                    {getInitials(story.userName)}
                  </Text>
                </View>
              )}
            </View>

            <Text
              numberOfLines={1}
              style={{
                maxWidth: 70,
                fontFamily: 'Manrope_600SemiBold',
                fontSize: 12,
                marginTop: 6,
                color: COLORS.text,
              }}
            >
              {story.userName}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
