import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '../../components/Avatar';
import { CircleBackdrop } from '../../components/circles/CircleBackdrop';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  deleteTwoPersonThought,
  getTwoPersonThought,
  subscribeToTwoPersonThoughtChanges,
} from '../../services/twoPersonThoughtService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';
import { markSharedThoughtRead } from '../../services/participationService';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(77,185,229,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatSharedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TwoPersonThoughtDetailContent({ route, navigation }) {
  const {
    thoughtId,
    conversationId,
    circleName = 'Our Circle',
  } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cachedThought = readNavigationCache(navigationCacheKeys.thought(thoughtId));
  const [thought, setThought] = useState(cachedThought || null);
  const [loading, setLoading] = useState(!cachedThought);
  const hasLoadedRef = useRef(Boolean(cachedThought));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!thoughtId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const nextThought = await getTwoPersonThought(thoughtId);
      if (nextThought?.status === 'shared' && !nextThought?.isAuthor) {
        void markSharedThoughtRead(thoughtId).catch(() => {});
      }
      setThought(nextThought);
      writeNavigationCache(navigationCacheKeys.thought(thoughtId), nextThought);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this thought.');
    } finally {
      setLoading(false);
    }
  }, [thoughtId]);

  useFocusEffect(
    useCallback(() => {
      void load({ quiet: hasLoadedRef.current }).finally(() => {
        hasLoadedRef.current = true;
      });
      return subscribeToTwoPersonThoughtChanges({
        conversationId,
        onChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  const remove = () => {
    if (!thought?.isAuthor || working) return;
    Alert.alert(
      'Remove shared thought?',
      'This removes it from the shared Circle for both people. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setWorking(true);
            setError('');
            try {
              await deleteTwoPersonThought(thoughtId);
              navigation.goBack();
            } catch (removeError) {
              setError(removeError?.message || 'Could not remove this thought.');
              setWorking(false);
            }
          },
        },
      ]
    );
  };

  if (loading && !thought) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.stateText}>Opening thought…</Text>
      </SafeAreaView>
    );
  }

  if (!thought) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={38} color={theme.circle.accent} />
        <Text style={styles.errorState}>{error || 'This thought is unavailable.'}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <CircleBackdrop conversationId={conversationId} imageTintOpacity={0.10} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.contextRow}>
          <Ionicons name="lock-closed" size={11} color={theme.colors.subtext} />
          <Text style={styles.contextText}>{circleName} · shared only with each other</Text>
        </View>

        <View style={styles.articleCard}>
          <View style={styles.authorRow}>
            <Avatar size={44} name={thought.authorName} uri={thought.authorAvatarUrl} />
            <View style={styles.authorCopy}>
              <Text style={styles.authorName}>
                {thought.isAuthor ? 'Shared by you' : `Shared by ${thought.authorName}`}
              </Text>
              <Text style={styles.sharedAt}>{formatSharedAt(thought.sharedAt)}</Text>
            </View>
          </View>

          <Text style={styles.title}>{thought.title || 'A shared thought'}</Text>
          <Text style={styles.body}>{thought.body}</Text>
        </View>

        <View style={styles.readOnlyCard}>
          <View style={styles.readOnlyIcon}>
            <Ionicons name="shield-checkmark-outline" size={19} color={theme.colors.text} />
          </View>
          <View style={styles.readOnlyCopy}>
            <Text style={styles.readOnlyTitle}>Shared as written</Text>
            <Text style={styles.readOnlyBody}>
              Shared thoughts are read-only. A new thought can be written later without changing what was already shared.
            </Text>
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {thought.isAuthor ? (
          <Pressable
            disabled={working}
            onPress={remove}
            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
          >
            <Text style={styles.removeButtonText}>Remove from Our Circle</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export function TwoPersonThoughtDetailScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <TwoPersonThoughtDetailContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  const glass = rgba(theme.colors.surface, 0.84);
  const glassStrong = rgba(theme.colors.surface, 0.93);
  const accentBorder = rgba(theme.circle.accent, 0.20);

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 70 },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: glassStrong,
      paddingHorizontal: 28,
      gap: 10,
    },
    stateText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    errorState: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 13, textAlign: 'center' },
    retryButton: {
      marginTop: 4,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: theme.welcome.brandInk,
    },
    retryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 12 },
    contextRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    contextText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
    articleCard: { marginTop: 18, padding: 18, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: accentBorder, backgroundColor: glassStrong },
    authorRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    authorCopy: { flex: 1 },
    authorName: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    sharedAt: { marginTop: 2, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 10.5 },
    title: { marginTop: 22, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 26, lineHeight: 34 },
    body: { marginTop: 16, color: theme.colors.text, fontFamily: 'Manrope_400Regular', fontSize: 15, lineHeight: 25 },
    readOnlyCard: {
      marginTop: 30,
      padding: 14,
      borderRadius: 15,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: accentBorder,
      backgroundColor: glassStrong,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    readOnlyIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: theme.circle.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    readOnlyCopy: { flex: 1 },
    readOnlyTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
    readOnlyBody: {
      marginTop: 3,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 11,
      lineHeight: 16,
    },
    errorText: { marginTop: 14, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    removeButton: { marginTop: 22, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    removeButtonText: { color: '#b42318', fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
    pressed: { opacity: 0.72 },
  });
}
