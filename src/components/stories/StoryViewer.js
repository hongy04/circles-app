import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Audio, Video } from 'expo-av';
import { getInitials } from '../../utils/getInitials';

const IMAGE_DURATION_MS = 5000;

function shortAge(iso) {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const seconds = Math.max(
    1,
    Math.floor((Date.now() - timestamp) / 1000)
  );

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  return `${Math.floor(minutes / 60)}h`;
}

export function StoryViewer({
  user,
  index,
  onClose,
  onNext,
  onPrev,
  onDelete,
  deleting = false,
}) {
  const item = user?.items?.[index];
  const isImage = item?.media_type === 'image';
  const isVideo = item?.media_type === 'video';

  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [muted, setMuted] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  const elapsedImageMsRef = useRef(0);
  const didHoldRef = useRef(false);
  const finishHandledRef = useRef(false);
  const onNextRef = useRef(onNext);

  const paused = holding || !appActive || deleting || Boolean(mediaError);

  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState) => setAppActive(nextState === 'active')
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((error) => {
      console.warn('Could not enable story audio playback', error);
    });
  }, []);

  useEffect(() => {
    elapsedImageMsRef.current = 0;
    finishHandledRef.current = false;
    setProgress(0);
    setHolding(false);
    setMediaError(null);
    setMediaLoading(true);
  }, [item?.id, retryKey]);

  useEffect(() => {
    if (!item || !isImage || paused || mediaLoading) return undefined;

    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed =
        elapsedImageMsRef.current + (Date.now() - startedAt);
      const nextProgress = Math.min(1, elapsed / IMAGE_DURATION_MS);

      setProgress(nextProgress);

      if (nextProgress >= 1) {
        clearInterval(interval);
        elapsedImageMsRef.current = 0;
        onNextRef.current?.();
      }
    }, 40);

    return () => {
      clearInterval(interval);
      elapsedImageMsRef.current += Date.now() - startedAt;
    };
  }, [isImage, item, mediaLoading, paused]);

  if (!user || !item) return null;

  const holdHandlers = {
    delayLongPress: 170,
    onLongPress: () => {
      didHoldRef.current = true;
      setHolding(true);
    },
    onPressOut: () => {
      setHolding(false);
      setTimeout(() => {
        didHoldRef.current = false;
      }, 0);
    },
  };

  const navigateAfterTap = (direction) => {
    if (didHoldRef.current) {
      didHoldRef.current = false;
      return;
    }

    direction?.();
  };

  const retryMedia = () => {
    elapsedImageMsRef.current = 0;
    setProgress(0);
    setMediaError(null);
    setMediaLoading(true);
    setRetryKey((value) => value + 1);
  };

  const confirmDelete = () => {
    if (!onDelete || deleting) return;

    Alert.alert(
      'Delete this story?',
      'It will disappear immediately and cannot be restored.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(item),
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.progressHeader} pointerEvents="box-none">
        <View style={styles.progressRow}>
          {user.items.map((storyItem, itemIndex) => (
            <View key={storyItem.id || itemIndex} style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      itemIndex < index
                        ? 100
                        : itemIndex > index
                          ? 0
                          : progress * 100
                    }%`,
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.identityRow}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              {user.avatar ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={styles.avatarImage}
                />
              ) : (
                <Text style={styles.avatarInitials}>
                  {getInitials(user.userName)}
                </Text>
              )}
            </View>

            <View style={styles.identityText}>
              <Text style={styles.userName} numberOfLines={1}>
                {user.isMine ? 'Your Story' : user.userName}
              </Text>
              <Text style={styles.storyAge}>{shortAge(item.created_at)}</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            {isVideo ? (
              <Pressable
                onPress={() => setMuted((value) => !value)}
                accessibilityRole="button"
                accessibilityLabel={muted ? 'Unmute story' : 'Mute story'}
                style={({ pressed }) => [
                  styles.headerButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name={muted ? 'volume-mute' : 'volume-high'}
                  size={22}
                  color="#fff"
                />
              </Pressable>
            ) : null}

            {user.isMine && onDelete ? (
              <Pressable
                onPress={confirmDelete}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Delete story"
                style={({ pressed }) => [
                  styles.headerButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="trash-outline" size={21} color="#fff" />
              </Pressable>
            ) : null}

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close stories"
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="close" size={27} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.mediaStage}>
        {isImage ? (
          <Image
            key={`${item.id}-${retryKey}`}
            source={{ uri: item.url }}
            style={styles.media}
            resizeMode="contain"
            onLoadStart={() => setMediaLoading(true)}
            onLoad={() => {
              setMediaLoading(false);
              setMediaError(null);
            }}
            onError={() => {
              setMediaLoading(false);
              setMediaError('This photo could not be loaded.');
            }}
          />
        ) : (
          <Video
            key={`${item.id}-${retryKey}`}
            source={{ uri: item.url }}
            style={styles.media}
            resizeMode="contain"
            shouldPlay={!paused}
            isMuted={muted}
            volume={1}
            onPlaybackStatusUpdate={(status) => {
              if (!status) return;

              if (!status.isLoaded) {
                if (status.error) {
                  setMediaLoading(false);
                  setMediaError('This video could not be loaded.');
                }
                return;
              }

              setMediaLoading(false);
              setMediaError(null);

              if (status.durationMillis) {
                setProgress(
                  Math.min(
                    1,
                    (status.positionMillis || 0) / status.durationMillis
                  )
                );
              }

              if (status.didJustFinish && !finishHandledRef.current) {
                finishHandledRef.current = true;
                onNextRef.current?.();
              }
            }}
          />
        )}

        <View style={styles.tapLayer} pointerEvents="box-none">
          <Pressable
            {...holdHandlers}
            onPress={() => navigateAfterTap(onPrev)}
            accessibilityRole="button"
            accessibilityLabel="Previous story"
            style={styles.leftTapZone}
          />
          <Pressable
            {...holdHandlers}
            onPress={() => navigateAfterTap(onNext)}
            accessibilityRole="button"
            accessibilityLabel="Next story"
            style={styles.rightTapZone}
          />
        </View>

        {mediaLoading && !mediaError ? (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator color="#fff" />
            <Text style={styles.overlayText}>Loading story…</Text>
          </View>
        ) : null}

        {mediaError ? (
          <View style={styles.centerOverlay}>
            <Ionicons name="alert-circle-outline" size={36} color="#fff" />
            <Text style={styles.errorText}>{mediaError}</Text>
            <Pressable
              onPress={retryMedia}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {deleting ? (
          <View style={styles.centerOverlay}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.overlayText}>Deleting story…</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.hint} pointerEvents="none">
        Tap to move • Hold to pause
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  progressHeader: {
    position: 'absolute',
    top: 8,
    left: 10,
    right: 10,
    zIndex: 20,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 5,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: '#2c2c2e',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  identityText: {
    flex: 1,
    marginLeft: 9,
  },
  userName: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  storyAge: {
    marginTop: 1,
    color: 'rgba(255,255,255,0.72)',
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  mediaStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  tapLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    paddingTop: 72,
  },
  leftTapZone: {
    width: '34%',
    height: '100%',
  },
  rightTapZone: {
    flex: 1,
    height: '100%',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  overlayText: {
    marginTop: 10,
    color: '#fff',
    fontFamily: 'Manrope_600SemiBold',
  },
  errorText: {
    marginTop: 10,
    color: '#fff',
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  retryText: {
    color: '#000',
    fontFamily: 'Manrope_700Bold',
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    color: 'rgba(255,255,255,0.68)',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    textAlign: 'center',
    zIndex: 20,
  },
  pressed: {
    opacity: 0.65,
  },
});
