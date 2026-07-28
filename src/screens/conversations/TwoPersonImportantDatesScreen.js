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
  listTwoPersonImportantDates,
  subscribeToTwoPersonImportantDateChanges,
} from '../../services/twoPersonImportantDateService';

const CATEGORY_META = Object.freeze({
  anniversary: { label: 'Anniversary', icon: 'heart-outline' },
  birthday: { label: 'Birthday', icon: 'gift-outline' },
  trip: { label: 'Trip', icon: 'airplane-outline' },
  tradition: { label: 'Tradition', icon: 'repeat-outline' },
  meaningful: { label: 'Meaningful', icon: 'star-outline' },
});

function parseDateValue(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== monthIndex
    || date.getDate() !== day
  ) return null;
  return date;
}

function clampedDate(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDay), 12, 0, 0, 0);
}

function getNextOccurrence(item, now = new Date()) {
  const original = parseDateValue(item.dateValue);
  if (!original) return null;
  if (item.recurrence !== 'yearly') return original;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  let candidate = clampedDate(
    today.getFullYear(),
    original.getMonth(),
    original.getDate()
  );
  if (candidate < today) {
    candidate = clampedDate(
      today.getFullYear() + 1,
      original.getMonth(),
      original.getDate()
    );
  }
  return candidate;
}

function formatDate(item) {
  const date = getNextOccurrence(item);
  if (!date) return 'Date unavailable';

  const options = item.recurrence === 'yearly'
    ? { weekday: 'short', month: 'long', day: 'numeric' }
    : { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' };

  return date.toLocaleDateString([], options);
}

function ImportantDateCard({ item, onPress }) {
  const category = CATEGORY_META[item.category] || CATEGORY_META.meaningful;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={category.icon} size={20} color={COLORS.text} />
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          {item.recurrence === 'yearly' ? (
            <View style={styles.recurrenceBadge}>
              <Text style={styles.recurrenceText}>YEARLY</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardDate} numberOfLines={1}>{formatDate(item)}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {category.label}{item.note ? ` · ${item.note}` : ''}
        </Text>
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

export function TwoPersonImportantDatesScreen({ route, navigation }) {
  const { conversationId, circleName = 'Our Circle' } = route.params || {};
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      setDates(await listTwoPersonImportantDates(conversationId));
    } catch (loadError) {
      setError(loadError?.message || 'Could not open important dates.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
      return subscribeToTwoPersonImportantDateChanges({
        conversationId,
        onChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  const sections = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = dates
      .filter((item) => {
        const next = getNextOccurrence(item, today);
        return Boolean(next && (item.recurrence === 'yearly' || next >= today));
      })
      .sort((a, b) => getNextOccurrence(a, today) - getNextOccurrence(b, today));

    const past = dates
      .filter((item) => {
        const next = getNextOccurrence(item, today);
        return Boolean(next && item.recurrence !== 'yearly' && next < today);
      })
      .sort((a, b) => getNextOccurrence(b, today) - getNextOccurrence(a, today));

    return [
      ...(upcoming.length ? [{ key: 'upcoming', title: 'Coming up', data: upcoming }] : []),
      ...(past.length ? [{ key: 'past', title: 'Past dates', data: past }] : []),
    ];
  }, [dates]);

  const flatData = useMemo(() => sections.flatMap((section) => ([
    { type: 'header', id: `header-${section.key}`, title: section.title },
    ...section.data.map((item) => ({ type: 'date', id: item.id, item })),
  ])), [sections]);

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening important dates…</Text>
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
            <Text style={styles.headerTitle}>Important Dates</Text>
            <Text style={styles.headerBody}>
              Keep anniversaries, birthdays, trips, and traditions that matter to your shared story. This is not a general calendar.
            </Text>
            <Pressable
              onPress={() => navigation.navigate('TwoPersonImportantDateEditor', {
                conversationId,
                circleName,
              })}
              style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.newButtonText}>Add Important Date</Text>
            </Pressable>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        )}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <SectionHeader
                title={item.title}
                subtitle={item.title === 'Coming up'
                  ? 'Yearly dates automatically roll forward to their next occurrence.'
                  : 'One-time dates remain part of your shared history.'}
              />
            );
          }
          return (
            <ImportantDateCard
              item={item.item}
              onPress={() => navigation.navigate('TwoPersonImportantDateEditor', {
                conversationId,
                circleName,
                importantDateId: item.item.id,
              })}
            />
          );
        }}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={42} color={COLORS.subtext} />
            <Text style={styles.emptyTitle}>Save a date that matters</Text>
            <Text style={styles.emptyBody}>
              Start with an anniversary, birthday, trip, or tradition you both want to remember.
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
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, gap: 10 },
  stateText: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
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
  card: { minHeight: 84, marginHorizontal: 14, marginBottom: 9, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, backgroundColor: '#f8f8f8', flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#ededed', alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, marginHorizontal: 11 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  recurrenceBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#e9e9e9' },
  recurrenceText: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 9 },
  cardDate: { marginTop: 4, color: COLORS.text, fontFamily: 'Manrope_600SemiBold', fontSize: 11.5 },
  cardMeta: { marginTop: 3, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11.5 },
  emptyState: { alignItems: 'center', paddingHorizontal: 34, paddingTop: 42 },
  emptyTitle: { marginTop: 12, color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 17 },
  emptyBody: { marginTop: 6, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
