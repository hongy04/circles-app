import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Video } from 'expo-av';

export function StoryViewer({
  user,
  index,
  onClose,
  onNext,
  onPrev,
}) {
  const item = user?.items?.[index];
  const isImage = item?.media_type === 'image';
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(null);

  useEffect(() => {
    setProgress(0);

    if (isImage) {
      clearInterval(progressRef.current);
      const start = Date.now();

      progressRef.current = setInterval(() => {
        const elapsed = (Date.now() - start) / 5000;

        if (elapsed >= 1) {
          clearInterval(progressRef.current);
          onNext();
        } else {
          setProgress(elapsed);
        }
      }, 50);
    }

    return () => clearInterval(progressRef.current);
  }, [item?.id]);

  if (!user || !item) return null;

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          zIndex: 10,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            gap: 6,
            marginBottom: 8,
          }}
        >
          {user.items.map((_, itemIndex) => (
            <View
              key={itemIndex}
              style={{
                flex: 1,
                height: 3,
                backgroundColor: 'rgba(255,255,255,0.3)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${
                    itemIndex < index
                      ? 100
                      : itemIndex > index
                        ? 0
                        : progress * 100
                  }%`,
                  height: '100%',
                  backgroundColor: '#fff',
                }}
              />
            </View>
          ))}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: '#fff',
              }}
            >
              {user.avatar ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : null}
            </View>

            <Text
              style={{
                color: '#fff',
                marginLeft: 8,
                fontFamily: 'Manrope_700Bold',
              }}
            >
              {user.userName}
            </Text>
          </View>

          <Pressable onPress={onClose}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Pressable style={{ flex: 1, flexDirection: 'row' }}>
        <Pressable style={{ flex: 1 }} onPress={onPrev} />

        <View
          style={{
            width: Math.min(800, Dimensions.get('window').width),
            aspectRatio: 9 / 16,
            alignSelf: 'center',
          }}
        >
          {isImage ? (
            <Image
              source={{ uri: item.url }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <Video
              source={{ uri: item.url }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              shouldPlay
              onPlaybackStatusUpdate={(status) => {
                if (!status || !status.isLoaded) return;
                if (status.didJustFinish) onNext();

                if (status.durationMillis) {
                  setProgress(
                    Math.min(
                      1,
                      (status.positionMillis || 0) /
                        status.durationMillis
                    )
                  );
                }
              }}
            />
          )}
        </View>

        <Pressable style={{ flex: 1 }} onPress={onNext} />
      </Pressable>
    </View>
  );
}
