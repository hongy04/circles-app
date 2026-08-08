import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { getInitials } from '../../utils/getInitials';

function SenderBubble({ whisper, size = 76 }) {
  const avatarUri = whisper?.senderAvatar;
  const initials = getInitials(whisper?.senderName || 'Connection');

  return (
    <View style={[styles.senderBubbleShell, { width: size, height: size, borderRadius: size / 2 }]}> 
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.94)',
          'rgba(154,226,255,0.58)',
          'rgba(227,188,255,0.42)',
          'rgba(255,255,255,0.82)',
        ]}
        start={{ x: 0.06, y: 0.04 }}
        end={{ x: 0.94, y: 0.96 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />

      <View
        style={[
          styles.senderLens,
          {
            left: 3,
            top: 3,
            width: size - 6,
            height: size - 6,
            borderRadius: (size - 6) / 2,
          },
        ]}
      >
        {avatarUri ? (
          <>
            <Image
              source={{ uri: avatarUri }}
              resizeMode="cover"
              style={[
                styles.senderAvatar,
                {
                  width: size * 1.15,
                  height: size * 1.15,
                  left: -size * 0.075,
                  top: -size * 0.08,
                  transform: [{ scaleX: 1.04 }, { scaleY: 1.08 }],
                },
              ]}
            />
            <Image
              source={{ uri: avatarUri }}
              resizeMode="cover"
              style={[
                styles.senderAvatar,
                styles.senderAvatarRefraction,
                {
                  width: size * 1.2,
                  height: size * 1.2,
                  left: -size * 0.05,
                  top: -size * 0.105,
                  transform: [{ translateX: size * 0.025 }, { scaleX: 1.08 }],
                },
              ]}
            />
          </>
        ) : (
          <View style={styles.senderInitialsFill}>
            <Text style={[styles.senderInitials, { fontSize: Math.max(15, size * 0.25) }]}>{initials}</Text>
          </View>
        )}

        <LinearGradient
          colors={[
            'rgba(255,255,255,0.38)',
            'rgba(255,255,255,0.03)',
            'rgba(120,207,255,0.10)',
            'rgba(242,174,255,0.17)',
          ]}
          locations={[0, 0.33, 0.72, 1]}
          start={{ x: 0.12, y: 0.02 }}
          end={{ x: 0.9, y: 0.98 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View
        style={[
          styles.senderHighlightArc,
          {
            left: size * 0.17,
            top: size * 0.12,
            width: size * 0.4,
            height: size * 0.22,
            borderRadius: size,
          },
        ]}
      />
      <View
        style={[
          styles.senderHighlightDot,
          {
            width: size * 0.09,
            height: size * 0.09,
            borderRadius: size,
            right: size * 0.18,
            bottom: size * 0.17,
          },
        ]}
      />
    </View>
  );
}

export function WhisperReadSheet({
  whisper,
  busy = false,
  onPop,
  onReport,
  onBlock,
}) {
  const theme = useThemeTokens();
  const reduceMotion = useReducedMotion();
  const [safetyVisible, setSafetyVisible] = useState(false);
  const progress = useSharedValue(0);
  const visible = Boolean(whisper);

  useEffect(() => {
    if (!visible) {
      setSafetyVisible(false);
      progress.value = 0;
      return;
    }

    progress.value = reduceMotion
      ? 1
      : withTiming(1, {
          duration: 300,
          easing: Easing.out(Easing.cubic),
        });
  }, [progress, reduceMotion, visible, whisper?.id]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [20, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.94, 1]) },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  const displayName = whisper?.senderName || 'Connection';
  const firstName = useMemo(
    () => displayName.trim().split(/\s+/)[0] || 'Connection',
    [displayName]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={() => {
        if (!busy) onPop?.();
      }}
    >
      <View style={styles.modalRoot}>
        <Animated.View pointerEvents="none" style={[styles.backdrop, backdropStyle]} />

        <Animated.View
          style={[
            styles.card,
            {
              borderColor: 'rgba(255,255,255,0.68)',
              shadowColor: theme.colors.text,
            },
            cardStyle,
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.96)',
              'rgba(238,249,255,0.93)',
              'rgba(250,242,255,0.91)',
            ]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.92, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.cardGlow} />

          <View style={styles.topRow}>
            <View style={styles.titleCopy}>
              <Text style={[styles.eyebrow, { color: theme.colors.subtext }]}>A WHISPER FROM</Text>
              <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{displayName}</Text>
            </View>

            <Pressable
              disabled={busy}
              hitSlop={10}
              onPress={() => setSafetyVisible((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel="Whisper safety options"
              style={({ pressed }) => [
                styles.menuButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="ellipsis-horizontal" size={21} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.bubbleWrap}>
            <SenderBubble whisper={whisper} size={78} />
          </View>

          <Text style={[styles.body, { color: theme.colors.text }]}>{whisper?.body || ''}</Text>

          <Text style={[styles.goneHint, { color: theme.colors.subtext }]}>When you pop it, it’s gone.</Text>

          <Pressable
            disabled={busy}
            onPress={onPop}
            accessibilityRole="button"
            accessibilityLabel={`Pop Whisper from ${displayName}`}
            style={({ pressed }) => [
              styles.popButton,
              { backgroundColor: theme.colors.text },
              (pressed || busy) && styles.popButtonPressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={theme.colors.bg} />
            ) : (
              <>
                <View style={styles.popGlyph}>
                  <View style={[styles.popRing, { borderColor: theme.colors.bg }]} />
                  <View style={[styles.popDot, { backgroundColor: theme.colors.bg }]} />
                </View>
                <Text style={[styles.popText, { color: theme.colors.bg }]}>Pop Whisper</Text>
              </>
            )}
          </Pressable>

          {safetyVisible ? (
            <View style={styles.safetyMenu}>
              <Pressable
                disabled={busy}
                onPress={() => {
                  setSafetyVisible(false);
                  onReport?.();
                }}
                style={({ pressed }) => [styles.safetyRow, pressed && styles.pressed]}
              >
                <Ionicons name="flag-outline" size={19} color={theme.colors.text} />
                <View style={styles.safetyCopy}>
                  <Text style={[styles.safetyTitle, { color: theme.colors.text }]}>Report Whisper</Text>
                  <Text style={[styles.safetyBody, { color: theme.colors.subtext }]}>Save this Whisper privately as report evidence.</Text>
                </View>
              </Pressable>
              <View style={styles.safetyDivider} />
              <Pressable
                disabled={busy}
                onPress={() => {
                  setSafetyVisible(false);
                  onBlock?.();
                }}
                style={({ pressed }) => [styles.safetyRow, pressed && styles.pressed]}
              >
                <Ionicons name="ban-outline" size={19} color="#B42318" />
                <View style={styles.safetyCopy}>
                  <Text style={[styles.safetyTitle, { color: '#B42318' }]}>Block {firstName}</Text>
                  <Text style={[styles.safetyBody, { color: theme.colors.subtext }]}>End the connection and remove active Whispers.</Text>
                </View>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,16,30,0.34)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    minHeight: 330,
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 20,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 13 },
    elevation: 10,
  },
  cardGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(180,230,255,0.18)',
    right: -70,
    top: -58,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    zIndex: 3,
  },
  titleCopy: {
    flex: 1,
  },
  eyebrow: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10.5,
    letterSpacing: 1.4,
  },
  title: {
    marginTop: 3,
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.56)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(82,104,122,0.18)',
  },
  bubbleWrap: {
    alignSelf: 'center',
    marginTop: 17,
    marginBottom: 15,
  },
  senderBubbleShell: {
    overflow: 'visible',
    shadowColor: '#527A98',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  senderLens: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: 'rgba(230,242,250,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  senderAvatar: {
    position: 'absolute',
  },
  senderAvatarRefraction: {
    opacity: 0.18,
  },
  senderInitialsFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(220,236,246,0.96)',
  },
  senderInitials: {
    color: 'rgba(33,50,64,0.78)',
    fontFamily: 'Manrope_700Bold',
  },
  senderHighlightArc: {
    position: 'absolute',
    borderColor: 'rgba(255,255,255,0.92)',
    borderTopWidth: 2,
    borderLeftWidth: 1.2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    transform: [{ rotate: '-18deg' }],
  },
  senderHighlightDot: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.66)',
  },
  body: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 18,
    lineHeight: 27,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  goneHint: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12,
  },
  popButton: {
    minHeight: 50,
    marginTop: 17,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
  },
  popButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  popGlyph: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popRing: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.4,
  },
  popDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    top: 0,
    right: 0,
    opacity: 0.88,
  },
  popText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  safetyMenu: {
    position: 'absolute',
    top: 62,
    right: 16,
    width: 245,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(71,91,107,0.2)',
    shadowColor: '#132333',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 12,
    zIndex: 10,
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  safetyCopy: {
    flex: 1,
  },
  safetyTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  safetyBody: {
    marginTop: 2,
    fontFamily: 'Manrope_500Medium',
    fontSize: 11.5,
    lineHeight: 16,
  },
  safetyDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(72,92,108,0.16)',
    marginLeft: 44,
  },
  pressed: {
    opacity: 0.68,
  },
});
