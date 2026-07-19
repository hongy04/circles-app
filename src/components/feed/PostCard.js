import React, { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
}) {
  const [showBigHeart, setShowBigHeart] = useState(false);
  const lastTapRef = useRef(0);

  const onImagePress = () => {
    const now = Date.now();

    if (now - lastTapRef.current < 300) {
      setShowBigHeart(true);
      if (!post.liked) onDoubleLike?.();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => setShowBigHeart(false), 650);
    }

    lastTapRef.current = now;
  };

  return (
    <View
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: COLORS.divider,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 12,
        }}
      >
        <Avatar
          size={36}
          name={post.user.name}
          uri={post.user.avatarUri}
        />

        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text
            style={{
              fontFamily: 'Manrope_700Bold',
              color: COLORS.text,
            }}
          >
            {post.user.name}
          </Text>
          <Text
            style={{
              fontFamily: 'Manrope_400Regular',
              color: '#888',
              fontSize: 12,
            }}
          >
            {post.time}
          </Text>
        </View>

        <Ionicons name="ellipsis-horizontal" size={18} color="#888" />
      </View>

      <Pressable
        onPress={onImagePress}
        style={{ backgroundColor: '#f2f2f2' }}
      >
        <View style={{ width: '100%', aspectRatio: 1 }}>
          <Image
            source={{ uri: post.uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />

          {showBigHeart ? (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <MotiView
                from={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1.1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={{ type: 'timing', duration: 350 }}
              >
                <Ionicons
                  name="heart"
                  size={96}
                  color="#fff"
                  style={{
                    textShadowColor: 'rgba(0,0,0,0.35)',
                    textShadowOffset: { width: 0, height: 2 },
                    textShadowRadius: 8,
                  }}
                />
              </MotiView>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Pressable
          onPress={onToggleLike}
          hitSlop={10}
          style={{ marginRight: 16 }}
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
          style={{ marginRight: 16 }}
        >
          <Ionicons
            name="chatbubble-outline"
            size={24}
            color={COLORS.text}
          />
        </Pressable>

        <Pressable hitSlop={10}>
          <Ionicons
            name="paper-plane-outline"
            size={24}
            color={COLORS.text}
          />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
        <Text
          style={{
            fontFamily: 'Manrope_700Bold',
            color: COLORS.text,
          }}
        >
          {post.likes} likes
        </Text>

        <Text style={{ marginTop: 4, color: COLORS.text }}>
          <Text style={{ fontFamily: 'Manrope_700Bold' }}>
            {post.user.name}{' '}
          </Text>
          <Text style={{ fontFamily: 'Manrope_400Regular' }}>
            {post.caption}
          </Text>
        </Text>

        <Pressable onPress={onOpenComments}>
          <Text
            style={{
              color: '#6b6b6b',
              marginTop: 6,
              fontFamily: 'Manrope_400Regular',
            }}
          >
            View comments
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
