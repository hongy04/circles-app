import React, { useCallback, useEffect, useState } from 'react';
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
import {
  AGE_CORRECTION_STATUS_LABELS,
  fetchModerationAgeCorrectionQueue,
} from '../../services/ageCorrectionService';

const FILTERS = [
  { value: 'submitted', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: null, label: 'All' },
  { value: 'resolved', label: 'Resolved' },
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

export function ModerationAgeCorrectionsQueueScreen({ navigation }) {
  const [status, setStatus] = useState('submitted');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const rows = await fetchModerationAgeCorrectionQueue({ status });
      setRequests(rows);
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Could not load birth-date correction requests.');
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
        <Text style={styles.topBarTitle}>Age corrections</Text>
        <View style={styles.topBarSide} />
      </View>

      <View style={styles.privacyBanner}>
        <Ionicons name="lock-closed-outline" size={17} color="#674b18" />
        <Text style={styles.privacyText}>Admin-only sensitive data. Do not copy birth dates into general report notes.</Text>
      </View>

      <View style={styles.filterBar}>
        {FILTERS.map((filter) => {
          const selected = filter.value === status;
          return (
            <Pressable
              key={filter.label}
              onPress={() => setStatus(filter.value)}
              style={({ pressed }) => [styles.filter, selected && styles.filterSelected, pressed && styles.pressed]}
            >
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator /></View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.requestId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ refresh: true })} />}
          contentContainerStyle={[styles.content, requests.length === 0 && styles.emptyContent]}
          ListHeaderComponent={error ? <Text style={styles.errorText}>{error}</Text> : null}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-circle-outline" size={42} color={COLORS.subtext} />
              <Text style={styles.emptyTitle}>No matching requests</Text>
              <Text style={styles.emptyText}>This private correction queue is currently clear.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('ModerationAgeCorrectionDetail', { requestId: item.requestId })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <Avatar size={46} name={item.accountDisplayName} uri={item.accountAvatarUrl} />
              <View style={styles.cardCopy}>
                <Text numberOfLines={1} style={styles.name}>{item.accountDisplayName}</Text>
                {item.accountUsername ? <Text style={styles.username}>@{item.accountUsername}</Text> : null}
                <Text style={styles.meta}>{AGE_CORRECTION_STATUS_LABELS[item.status] || item.status}</Text>
                <Text style={styles.meta}>{formatDate(item.submittedAt)}</Text>
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
  privacyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff6df', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5cf9d' },
  privacyText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5, lineHeight: 15, color: '#674b18' },
  filterBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  filter: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999, backgroundColor: '#f3f3f3' },
  filterSelected: { backgroundColor: COLORS.text },
  filterText: { fontFamily: 'Manrope_600SemiBold', fontSize: 10, color: COLORS.subtext },
  filterTextSelected: { color: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 14, paddingBottom: 40, gap: 10 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  card: { minHeight: 94, flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 16, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  cardCopy: { flex: 1, marginLeft: 11, marginRight: 8 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: COLORS.text },
  username: { marginTop: 1, fontFamily: 'Manrope_500Medium', fontSize: 11, color: COLORS.subtext },
  meta: { marginTop: 3, fontFamily: 'Manrope_500Medium', fontSize: 10, color: COLORS.subtext },
  emptyState: { alignItems: 'center', paddingHorizontal: 30 },
  emptyTitle: { marginTop: 14, fontFamily: 'Manrope_700Bold', fontSize: 18, color: COLORS.text },
  emptyText: { marginTop: 6, fontFamily: 'Manrope_500Medium', color: COLORS.subtext, textAlign: 'center' },
  errorText: { marginBottom: 8, color: '#b42318', fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  pressed: { opacity: 0.65 },
});
