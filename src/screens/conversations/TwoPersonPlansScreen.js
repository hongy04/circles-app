import React, { useCallback, useMemo, useState } from 'react';
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

import { COLORS } from '../../theme/colors';
import {
  listTwoPersonPlans,
  subscribeToTwoPersonPlanChanges,
} from '../../services/twoPersonPlanService';

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

function PlanCard({ plan, onPress }) {
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
          color={COLORS.text}
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

function SectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function TwoPersonPlansScreen({ route, navigation }) {
  const { conversationId, circleName = 'Our Circle' } = route.params || {};
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      setPlans(await listTwoPersonPlans(conversationId));
    } catch (loadError) {
      setError(loadError?.message || 'Could not open shared plans.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
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
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening shared plans…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={flatData}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={(
          <View style={styles.header}>
            <View style={styles.lockRow}>
              <Ionicons name="lock-closed" size={12} color={COLORS.subtext} />
              <Text style={styles.lockText}>{circleName} · private to the two of you</Text>
            </View>
            <Text style={styles.headerTitle}>Plans</Text>
            <Text style={styles.headerBody}>
              Keep an idea, suggest a date or place, schedule it together, and preserve what happened as a shared memory.
            </Text>
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
                subtitle={item.title === 'Memories'
                  ? 'Completed plans stay here and appear in your Circle Timeline.'
                  : null}
              />
            );
          }
          return (
            <PlanCard
              plan={item.plan}
              onPress={() => navigation.navigate('TwoPersonPlanDetail', {
                planId: item.plan.id,
                conversationId,
                circleName,
              })}
            />
          );
        }}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={42} color={COLORS.subtext} />
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
            tintColor={COLORS.text}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  listContent: { flexGrow: 1, paddingBottom: 36 },
  header: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lockText: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
  headerTitle: { marginTop: 9, color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 25 },
  headerBody: { marginTop: 6, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19 },
  newButton: { marginTop: 15, minHeight: 43, borderRadius: 11, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  newButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  errorText: { marginTop: 10, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  sectionHeader: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 },
  sectionTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 16 },
  sectionSubtitle: { marginTop: 2, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11.5, lineHeight: 16 },
  planCard: { minHeight: 84, marginHorizontal: 14, marginBottom: 9, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, backgroundColor: '#f8f8f8', flexDirection: 'row', alignItems: 'center' },
  planIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#ededed', alignItems: 'center', justifyContent: 'center' },
  planCopy: { flex: 1, marginHorizontal: 11 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planTitle: { flex: 1, color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#e9e9e9' },
  statusText: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 9.5 },
  planMeta: { marginTop: 4, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11.5 },
  planHint: { marginTop: 4, color: COLORS.text, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5, lineHeight: 15 },
  emptyState: { minHeight: 330, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
  emptyTitle: { marginTop: 13, color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 18, textAlign: 'center' },
  emptyBody: { marginTop: 7, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: COLORS.bg },
  stateText: { marginTop: 10, color: COLORS.subtext, fontFamily: 'Manrope_400Regular' },
  pressed: { opacity: 0.72 },
});
