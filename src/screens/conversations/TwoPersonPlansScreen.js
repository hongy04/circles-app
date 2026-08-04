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

import { ThemeAtmosphere } from '../../components/ThemeAtmosphere';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  listTwoPersonPlans,
  subscribeToTwoPersonPlanChanges,
} from '../../services/twoPersonPlanService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

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

function formatPlanDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusCopy(plan) {
  if (plan.status === 'completed') return 'Memory';
  if (plan.status === 'scheduled') return 'Scheduled';
  if (plan.status === 'proposed') {
    return plan.responseState === 'tentative' ? 'Tentative' : 'Proposed';
  }
  return 'Idea';
}

function PlanCard({ plan, onPress, styles, theme }) {
  const dateLabel = formatPlanDate(plan.startsAt);
  const metadata = [dateLabel, plan.locationName].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.planCard, pressed && styles.pressed]}
    >
      <View style={styles.planIcon}>
        <Ionicons
          name={plan.status === 'completed' ? 'sparkles' : 'calendar-outline'}
          size={20}
          color={theme.colors.text}
        />
      </View>
      <View style={styles.planCopy}>
        <View style={styles.planTitleRow}>
          <Text style={styles.planTitle} numberOfLines={1}>{plan.title}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{statusCopy(plan)}</Text>
          </View>
        </View>
        {metadata ? (
          <Text style={styles.planMeta} numberOfLines={1}>{metadata}</Text>
        ) : (
          <Text style={styles.planMeta}>No date chosen yet</Text>
        )}
        {plan.status === 'proposed' ? (
          <Text style={styles.planHint} numberOfLines={1}>
            {plan.isProposalMine
              ? `Waiting for the other person${plan.responseState === 'tentative' ? ' · they marked tentative' : ''}`
              : plan.responseState === 'tentative'
                ? 'You marked this as tentative'
                : 'Your response is needed'}
          </Text>
        ) : null}
        {plan.status === 'completed' && plan.memoryNote ? (
          <Text style={styles.planHint} numberOfLines={2}>{plan.memoryNote}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
    </Pressable>
  );
}

function SectionHeader({ title, subtitle, styles }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function TwoPersonPlansContent({ route, navigation }) {
  const { conversationId, circleName = 'Our Circle' } = route.params || {};
  const cachedPlans = readNavigationCache(navigationCacheKeys.twoPersonPlans(conversationId));
  const hasInitialPlans = Array.isArray(cachedPlans);
  const initialPlans = hasInitialPlans ? cachedPlans : [];
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [plans, setPlans] = useState(initialPlans);
  const [loading, setLoading] = useState(!hasInitialPlans);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(hasInitialPlans);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const nextPlans = await listTwoPersonPlans(conversationId);
      setPlans(nextPlans);
      writeNavigationCache(navigationCacheKeys.twoPersonPlans(conversationId), nextPlans);
      nextPlans.forEach((plan) => {
        writeNavigationCache(navigationCacheKeys.plan(plan.id), plan);
      });
    } catch (loadError) {
      setError(loadError?.message || 'Could not open shared plans.');
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
      return subscribeToTwoPersonPlanChanges({
        conversationId,
        onChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  const sections = useMemo(() => {
    const active = plans
      .filter((plan) => plan.status !== 'completed')
      .sort((a, b) => {
        if (a.startsAt && b.startsAt) return new Date(a.startsAt) - new Date(b.startsAt);
        if (a.startsAt) return -1;
        if (b.startsAt) return 1;
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });
    const memories = plans
      .filter((plan) => plan.status === 'completed')
      .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

    return [
      ...(active.length ? [{ key: 'active', title: 'Shared plans', data: active }] : []),
      ...(memories.length ? [{ key: 'memories', title: 'Memories', data: memories }] : []),
    ];
  }, [plans]);

  const flatData = useMemo(() => sections.flatMap((section) => ([
    { type: 'header', id: `header-${section.key}`, title: section.title },
    ...section.data.map((plan) => ({ type: 'plan', id: plan.id, plan })),
  ])), [sections]);

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ThemeAtmosphere theme={theme} strength={0.80} decals />
        <View style={styles.stateCard}>
          <ActivityIndicator color={theme.circle.accent} />
          <Text style={styles.stateText}>Opening shared plans…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ThemeAtmosphere theme={theme} strength={0.84} decals />
      <FlatList
        data={flatData}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={(
          <View style={styles.topActions}>
            <Pressable
              onPress={() => navigation.navigate('TwoPersonPlanEditor', {
                conversationId,
                circleName,
              })}
              style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.newButtonText}>New Idea</Text>
            </Pressable>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        )}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <SectionHeader
                title={item.title}
                styles={styles}
                subtitle={item.title === 'Memories'
                  ? 'Completed plans stay here and appear in your Circle Timeline.'
                  : null}
              />
            );
          }
          return (
            <PlanCard
              plan={item.plan}
              styles={styles}
              theme={theme}
              onPress={() => {
                writeNavigationCache(navigationCacheKeys.plan(item.plan.id), item.plan);
                navigation.navigate('TwoPersonPlanDetail', {
                  planId: item.plan.id,
                  conversationId,
                  circleName,
                });
              }}
            />
          );
        }}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={42} color={theme.colors.subtext} />
            <Text style={styles.emptyTitle}>Start with one small idea</Text>
            <Text style={styles.emptyBody}>
              Save something you may want to do together. It does not become a commitment until one person proposes it and the other accepts.
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
            tintColor={theme.circle.accent}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

export function TwoPersonPlansScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <TwoPersonPlansContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  const glass = rgba(theme.colors.surface, 0.84);
  const glassStrong = rgba(theme.colors.surface, 0.93);
  const accentBorder = rgba(theme.circle.accent, 0.20);

  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
  listContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingBottom: 36,
  },
  topActions: {
    marginTop: 14,
    marginBottom: 2,
    padding: 11,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glassStrong,
  },
  newButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: theme.welcome.brandInk,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: theme.welcome.brandInk,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  newButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  errorText: {
    marginTop: 10,
    paddingHorizontal: 2,
    color: '#b42318',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  sectionHeader: {
    paddingHorizontal: 4,
    paddingTop: 22,
    paddingBottom: 9,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  sectionSubtitle: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
  },
  planCard: {
    minHeight: 86,
    marginBottom: 9,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glass,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: theme.colors.text,
    shadowOpacity: 0.025,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  planIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: rgba(theme.circle.accent, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: rgba(theme.circle.accent, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCopy: { flex: 1, marginHorizontal: 11 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planTitle: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: rgba(theme.circle.accent, 0.11),
  },
  statusText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 9.5,
  },
  planMeta: {
    marginTop: 4,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
  },
  planHint: {
    marginTop: 4,
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10.5,
    lineHeight: 15,
  },
  emptyState: {
    minHeight: 330,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    marginTop: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glass,
  },
  emptyTitle: {
    marginTop: 13,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 7,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: theme.circle.profileBackground,
  },
  stateCard: {
    minWidth: 210,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glassStrong,
  },
  stateText: {
    marginTop: 10,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  pressed: { opacity: 0.74, transform: [{ scale: 0.995 }] },
  });
}
