import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import { Avatar } from '../../components/Avatar';
import { REPORT_REASONS } from '../../services/safetyService';
import {
  fetchModerationQueue,
  REPORT_STATUS_LABELS,
} from '../../services/safetyModerationService';

const FILTERS = [
  { value: 'submitted', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: null, label: 'All' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Closed' },
];

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function severityLabel(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : 'Untriaged';
}

export function ModerationQueueScreen({ navigation }) {
  const [status, setStatus] = useState('submitted');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const reasonLabels = useMemo(
    () => Object.fromEntries(REPORT_REASONS.map((item) => [item.value, item.label])),
    []
  );

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const rows = await fetchModerationQueue({ status });
      setReports(rows);
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Could not load the moderation queue.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => load());
    return unsubscribe;
  }, [navigation, load]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBarSide}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Moderation console</Text>
        <View style={styles.topBarSide} />
      </View>

      <View style={styles.filterBar}>
        {FILTERS.map((filter) => {
          const selected = filter.value === status;
          return (
            <Pressable
              key={filter.label}
              onPress={() => setStatus(filter.value)}
              style={({ pressed }) => [
                styles.filter,
                selected && styles.filterSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.stateText}>Loading reports…</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.reportId}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ refresh: true })}
              tintColor={COLORS.text}
            />
          )}
          contentContainerStyle={[
            styles.content,
            reports.length === 0 && styles.emptyContent,
          ]}
          ListHeaderComponent={error ? <Text style={styles.errorText}>{error}</Text> : null}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark-outline" size={42} color={COLORS.subtext} />
              <Text style={styles.emptyTitle}>No matching reports</Text>
              <Text style={styles.emptyText}>This queue is currently clear.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('ModerationReportDetail', {
                reportId: item.reportId,
              })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <Avatar
                size={46}
                name={item.reportedDisplayName}
                uri={item.reportedAvatarUrl}
              />
              <View style={styles.cardCopy}>
                <View style={styles.titleRow}>
                  <Text numberOfLines={1} style={styles.targetName}>
                    {item.reportedDisplayName}
                  </Text>
                  <View style={styles.severityPill}>
                    <Text style={styles.severityText}>{severityLabel(item.severity)}</Text>
                  </View>
                </View>
                <Text style={styles.reason} numberOfLines={1}>
                  {reasonLabels[item.reason] || item.reason}
                </Text>
                <Text style={styles.meta}>
                  {REPORT_STATUS_LABELS[item.status] || item.status} · {formatDate(item.createdAt)}
                </Text>
                {item.openReportsAgainstTarget > 1 ? (
                  <Text style={styles.repeatReports}>
                    {item.openReportsAgainstTarget} open reports against this account
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9a9a9a" />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  topBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, backgroundColor: COLORS.bg },
  topBarSide: { width: 52 },
  topBarTitle: { flex: 1, textAlign: 'center', fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text },
  filterBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  filter: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999, backgroundColor: '#f3f3f3' },
  filterSelected: { backgroundColor: COLORS.text },
  filterText: { fontFamily: 'Manrope_600SemiBold', fontSize: 10, color: COLORS.subtext },
  filterTextSelected: { color: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateText: { fontFamily: 'Manrope_500Medium', color: COLORS.subtext },
  content: { padding: 14, paddingBottom: 40, gap: 10 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  card: { minHeight: 92, flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 16, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  cardCopy: { flex: 1, marginLeft: 11, marginRight: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  targetName: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14, color: COLORS.text },
  severityPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#efefef' },
  severityText: { fontFamily: 'Manrope_700Bold', fontSize: 9, color: COLORS.subtext },
  reason: { marginTop: 3, fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: COLORS.text },
  meta: { marginTop: 3, fontFamily: 'Manrope_500Medium', fontSize: 10, color: COLORS.subtext },
  repeatReports: { marginTop: 4, fontFamily: 'Manrope_600SemiBold', fontSize: 10, color: '#9b2c2c' },
  emptyState: { alignItems: 'center', paddingHorizontal: 30 },
  emptyTitle: { marginTop: 14, fontFamily: 'Manrope_700Bold', fontSize: 18, color: COLORS.text },
  emptyText: { marginTop: 6, fontFamily: 'Manrope_500Medium', color: COLORS.subtext },
  errorText: { marginBottom: 8, color: '#b42318', fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  pressed: { opacity: 0.65 },
});
