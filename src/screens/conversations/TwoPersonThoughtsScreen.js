import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '../../components/Avatar';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  listTwoPersonThoughts,
  subscribeToTwoPersonThoughtChanges,
} from '../../services/twoPersonThoughtService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function displayTitle(item) {
  return item.title || (item.status === 'draft' ? 'Untitled draft' : 'A shared thought');
}

function ThoughtCard({ item, onPress, styles, theme }) {
  const isDraft = item.status === 'draft';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardTopRow}>
        {isDraft ? (
          <View style={styles.draftIcon}>
            <Ionicons name="lock-closed-outline" size={18} color={theme.colors.text} />
          </View>
        ) : (
          <Avatar
            size={38}
            name={item.authorName}
            uri={item.authorAvatarUrl}
          />
        )}
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle} numberOfLines={1}>{displayTitle(item)}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {isDraft
              ? `Private draft · Updated ${formatWhen(item.updatedAt)}`
              : `${item.isAuthor ? 'Shared by you' : `Shared by ${item.authorName}`} · ${formatWhen(item.sharedAt)}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
      </View>
      <Text style={styles.excerpt} numberOfLines={3}>{item.body}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, body, styles }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

function TwoPersonThoughtsContent({ route, navigation }) {
  const { conversationId, circleName = 'Our Circle' } = route.params || {};
  const cachedThoughts = readNavigationCache(navigationCacheKeys.twoPersonThoughts(conversationId));
  const hasInitialThoughts = Array.isArray(cachedThoughts);
  const initialThoughts = hasInitialThoughts ? cachedThoughts : [];
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [thoughts, setThoughts] = useState(initialThoughts);
  const [loading, setLoading] = useState(!hasInitialThoughts);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(hasInitialThoughts);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const nextThoughts = await listTwoPersonThoughts(conversationId);
      setThoughts(nextThoughts);
      writeNavigationCache(navigationCacheKeys.twoPersonThoughts(conversationId), nextThoughts);
      nextThoughts.forEach((thought) => {
        writeNavigationCache(navigationCacheKeys.thought(thought.id), thought);
      });
    } catch (loadError) {
      setError(loadError?.message || 'Could not open your shared thoughts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

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

  const rows = useMemo(() => {
    const drafts = thoughts
      .filter((item) => item.status === 'draft')
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    const shared = thoughts
      .filter((item) => item.status === 'shared')
      .sort((a, b) => new Date(b.sharedAt || 0) - new Date(a.sharedAt || 0));

    return [
      ...(drafts.length ? [
        { id: 'header-drafts', type: 'header', title: 'My private drafts', body: 'Only you can see these until you deliberately share one.' },
        ...drafts.map((item) => ({ id: item.id, type: 'thought', item })),
      ] : []),
      ...(shared.length ? [
        { id: 'header-shared', type: 'header', title: 'Shared with our Circle', body: 'Shared thoughts are read-only so their meaning cannot be silently changed later.' },
        ...shared.map((item) => ({ id: item.id, type: 'thought', item })),
      ] : []),
    ];
  }, [thoughts]);

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.stateText}>Opening thoughts…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={(
          <View style={styles.topActions}>
            <Pressable
              onPress={() => navigation.navigate('TwoPersonThoughtEditor', {
                conversationId,
                circleName,
              })}
              style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.newButtonText}>Start a Private Draft</Text>
            </Pressable>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        )}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <SectionHeader title={item.title} body={item.body} styles={styles} />;
          }
          return (
            <ThoughtCard
              item={item.item}
              styles={styles}
              theme={theme}
              onPress={() => {
                writeNavigationCache(navigationCacheKeys.thought(item.item.id), item.item);
                navigation.navigate(
                  item.item.status === 'draft'
                    ? 'TwoPersonThoughtEditor'
                    : 'TwoPersonThoughtDetail',
                  {
                    conversationId,
                    circleName,
                    thoughtId: item.item.id,
                  }
                );
              }}
            />
          );
        }}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={44} color={theme.circle.accent} />
            <Text style={styles.emptyTitle}>A quiet place for the words that take time</Text>
            <Text style={styles.emptyBody}>
              Start with a letter, apology, reflection, or anything you want to shape privately before sharing.
            </Text>
          </View>
        )}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load({ quiet: true });
            }}
            tintColor={theme.colors.text}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

export function TwoPersonThoughtsScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <TwoPersonThoughtsContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    listContent: { flexGrow: 1, paddingBottom: 40 },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.profileBackground,
      gap: 10,
    },
    stateText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    topActions: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 2 },
    newButton: {
      minHeight: 44,
      borderRadius: 11,
      backgroundColor: theme.welcome.brandInk,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    newButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
    errorText: { marginTop: 10, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    sectionHeader: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 7 },
    sectionTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 16 },
    sectionBody: {
      marginTop: 3,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 11,
      lineHeight: 16,
    },
    card: {
      marginHorizontal: 14,
      marginTop: 9,
      padding: 14,
      borderRadius: 15,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      backgroundColor: theme.colors.surface,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    draftIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: theme.circle.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardHeading: { flex: 1, minWidth: 0 },
    cardTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
    cardMeta: { marginTop: 2, color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
    excerpt: { marginTop: 11, color: theme.colors.text, fontFamily: 'Manrope_400Regular', fontSize: 12.5, lineHeight: 19 },
    emptyState: { minHeight: 330, paddingHorizontal: 34, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { marginTop: 13, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 16, textAlign: 'center' },
    emptyBody: {
      marginTop: 7,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
    pressed: { opacity: 0.72 },
  });
}
