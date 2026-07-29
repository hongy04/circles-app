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
import { REPORT_REASONS } from '../../services/safetyService';
import {
  fetchMyReportReceipts,
  REPORT_STATUS_LABELS,
} from '../../services/safetyModerationService';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusTone(status) {
  if (status === 'resolved') return { bg: '#eaf7ed', text: '#176b2c' };
  if (status === 'dismissed') return { bg: '#efefef', text: '#5d5d5d' };
  if (status === 'reviewing') return { bg: '#fff4dc', text: '#8a5500' };
  return { bg: '#eef3ff', text: '#2855a6' };
}

export function MySafetyReportsScreen({ navigation }) {
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
      setReports(await fetchMyReportReceipts());
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Could not load your report receipts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBarSide}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Reports you submitted</Text>
        <View style={styles.topBarSide} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.stateText}>Loading report receipts…</Text>
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
          ListHeaderComponent={reports.length > 0 ? (
            <View style={styles.notice}>
              <Ionicons name="shield-checkmark-outline" size={21} color={COLORS.text} />
              <Text style={styles.noticeText}>
                Your report history is private. Circles may share a broad outcome, but internal review notes and the reported account’s information remain hidden.
              </Text>
            </View>
          ) : null}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={42} color={COLORS.subtext} />
              <Text style={styles.emptyTitle}>No reports submitted</Text>
              <Text style={styles.emptyText}>
                Reports you submit will appear here with their review status.
              </Text>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
          )}
          renderItem={({ item }) => {
            const tone = statusTone(item.status);
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.reason}>
                    {reasonLabels[item.reason] || 'Safety report'}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.statusText, { color: tone.text }]}>
                      {REPORT_STATUS_LABELS[item.status] || item.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  Submitted {formatDate(item.createdAt)} · From {item.sourceContext || 'profile'}
                </Text>
                {item.publicResolutionMessage ? (
                  <View style={styles.outcomeBox}>
                    <Text style={styles.outcomeLabel}>Outcome</Text>
                    <Text style={styles.outcomeText}>{item.publicResolutionMessage}</Text>
                  </View>
                ) : (
                  <Text style={styles.pendingText}>
                    {item.status === 'submitted'
                      ? 'Circles received this report.'
                      : item.status === 'reviewing'
                        ? 'A safety reviewer is evaluating this report.'
                        : 'This review is closed.'}
                  </Text>
                )}
              </View>
            );
          }}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateText: { fontFamily: 'Manrope_500Medium', color: COLORS.subtext },
  content: { padding: 16, paddingBottom: 44, gap: 12 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  noticeText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, color: COLORS.subtext },
  card: { padding: 15, borderRadius: 16, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reason: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14, color: COLORS.text },
  statusPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  statusText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  meta: { marginTop: 6, fontFamily: 'Manrope_500Medium', fontSize: 11, color: COLORS.subtext },
  pendingText: { marginTop: 12, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, color: COLORS.subtext },
  outcomeBox: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#f5f5f5' },
  outcomeLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: COLORS.text },
  outcomeText: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18, color: COLORS.text },
  emptyState: { alignItems: 'center', paddingHorizontal: 30 },
  emptyTitle: { marginTop: 14, fontFamily: 'Manrope_700Bold', fontSize: 18, color: COLORS.text },
  emptyText: { marginTop: 7, textAlign: 'center', fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20, color: COLORS.subtext },
  errorText: { marginTop: 12, textAlign: 'center', color: '#b42318', fontFamily: 'Manrope_600SemiBold' },
});
