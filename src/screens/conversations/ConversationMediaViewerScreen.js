import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Audio, Video } from 'expo-av';

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ConversationMediaViewerScreen({ route, navigation }) {
  const items = useMemo(() => route.params?.items || [], [route.params?.items]);
  const requestedIndex = Number(route.params?.startIndex || 0);
  const [index, setIndex] = useState(
    Math.max(0, Math.min(requestedIndex, Math.max(0, items.length - 1)))
  );
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const item = items[index];

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
  }, [item?.id]);

  if (!item) {
    return (
      <SafeAreaView style={styles.root}>
        <Pressable onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <View style={styles.center}>
          <Text style={styles.emptyText}>This media is unavailable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const previous = () => {
    if (index > 0) setIndex((value) => value - 1);
  };

  const next = () => {
    if (index + 1 < items.length) setIndex((value) => value + 1);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.topButton}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        <View style={styles.meta}>
          <Text style={styles.sender} numberOfLines={1}>
            {item.senderName || 'Circle media'}
          </Text>
          <Text style={styles.time}>{formatTimestamp(item.createdAt)}</Text>
        </View>

        {item.mediaType === 'video' ? (
          <Pressable
            onPress={() => setMuted((value) => !value)}
            hitSlop={10}
            style={styles.topButton}
          >
            <Ionicons
              name={muted ? 'volume-mute' : 'volume-high'}
              size={23}
              color="#fff"
            />
          </Pressable>
        ) : (
          <View style={styles.topButton} />
        )}
      </View>

      <View style={styles.stage}>
        {item.mediaType === 'video' ? (
          <Video
            key={item.id}
            source={{ uri: item.url }}
            style={styles.media}
            resizeMode="contain"
            shouldPlay
            isMuted={muted}
            volume={1}
            useNativeControls
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        ) : (
          <Image
            key={item.id}
            source={{ uri: item.url }}
            style={styles.media}
            resizeMode="contain"
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        )}

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}

        <View style={styles.navigationLayer} pointerEvents="box-none">
          <Pressable
            onPress={previous}
            disabled={index === 0}
            style={styles.leftZone}
          />
          <Pressable
            onPress={next}
            disabled={index + 1 >= items.length}
            style={styles.rightZone}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.counter}>
          {index + 1} of {items.length}
        </Text>
        {item.messageBody ? (
          <Text style={styles.caption} numberOfLines={3}>
            {item.messageBody}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  topButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    zIndex: 2,
    top: 10,
    left: 8,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    alignItems: 'center',
  },
  sender: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  time: {
    marginTop: 1,
    color: 'rgba(255,255,255,0.66)',
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigationLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  leftZone: {
    width: '32%',
    height: '100%',
  },
  rightZone: {
    flex: 1,
    height: '100%',
  },
  footer: {
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  counter: {
    color: 'rgba(255,255,255,0.74)',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  caption: {
    marginTop: 5,
    color: '#fff',
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#fff',
    fontFamily: 'Manrope_600SemiBold',
  },
});
