import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
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

import { ContinuityLoadingCard } from '../../components/ContinuityLoadingCard';
import { CircleBackdrop } from '../../components/circles/CircleBackdrop';
import { ThemeAtmosphere } from '../../components/ThemeAtmosphere';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  listTwoPersonImportantDates,
  subscribeToTwoPersonImportantDateChanges,
} from '../../services/twoPersonImportantDateService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

const CATEGORY_META = Object.freeze({
  anniversary: { label: 'Anniversary', icon: 'heart-outline' },
  birthday: { label: 'Birthday', icon: 'gift-outline' },
  trip: { label: 'Trip', icon: 'airplane-outline' },
  tradition: { label: 'Tradition', icon: 'repeat-outline' },
  meaningful: { label: 'Meaningful', icon: 'star-outline' },
});

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

function ImportantDateCard({ item, onPress, styles, theme }) {
  const category = CATEGORY_META[item.category] || CATEGORY_META.meaningful;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={category.icon} size={20} color={theme.colors.text} />
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
      <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
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

function TwoPersonImportantDatesContent({ route, navigation }) {
  const { conversationId, circleName = 'Our Circle' } = route.params || {};
  const cachedDates = readNavigationCache(navigationCacheKeys.twoPersonDates(conversationId));
  const hasInitialDates = Array.isArray(cachedDates);
  const initialDates = hasInitialDates ? cachedDates : [];
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [dates, setDates] = useState(initialDates);
  const [loading, setLoading] = useState(!hasInitialDates);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(hasInitialDates);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const nextDates = await listTwoPersonImportantDates(conversationId);
      setDates(nextDates);
      writeNavigationCache(navigationCacheKeys.twoPersonDates(conversationId), nextDates);
      nextDates.forEach((item) => {
        writeNavigationCache(navigationCacheKeys.importantDate(item.id), item);
      });
    } catch (loadError) {
      setError(loadError?.message || 'Could not open important dates.');
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

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <CircleBackdrop conversationId={conversationId} imageTintOpacity={0.10} />
      <ThemeAtmosphere theme={theme} strength={0.28} decals />
      <FlatList
        data={flatData}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={(
          <View style={styles.topActions}>
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
            {error && dates.length > 0 ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        )}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <SectionHeader
                title={item.title}
                styles={styles}
                subtitle={item.title === 'Coming up'
                  ? 'Yearly dates automatically roll forward to their next occurrence.'
                  : 'One-time dates remain part of your shared history.'}
              />
            );
          }
          return (
            <ImportantDateCard
              item={item.item}
              styles={styles}
              theme={theme}
              onPress={() => {
                writeNavigationCache(navigationCacheKeys.importantDate(item.item.id), item.item);
                navigation.navigate('TwoPersonImportantDateEditor', {
                  conversationId,
                  circleName,
                  importantDateId: item.item.id,
                });
              }}
            />
          );
        }}
        ListEmptyComponent={loading ? (
          <ContinuityLoadingCard
            label="Loading important dates…"
            body="The shared date space is already open while the latest dates load."
            icon="calendar-outline"
          />
        ) : error ? (
          <ContinuityLoadingCard
            error={error}
            icon="calendar-outline"
            onRetry={() => load()}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={42} color={theme.circle.accent} />
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
            tintColor={theme.colors.text}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

export function TwoPersonImportantDatesScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <TwoPersonImportantDatesContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  const glass = rgba(theme.colors.surface, 0.82);
  const glassStrong = rgba(theme.colors.surface, 0.92);
  const accentBorder = rgba(theme.circle.accent, 0.20);

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    listContent: { flexGrow: 1, paddingBottom: 36 },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.profileBackground,
      gap: 10,
    },
    stateText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    topActions: { marginTop: 12, marginHorizontal: 14, padding: 10, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, borderColor: accentBorder, backgroundColor: glassStrong },
    newButton: {
      minHeight: 43,
      borderRadius: 11,
      backgroundColor: theme.welcome.brandInk,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    newButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
    errorText: { marginTop: 10, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    sectionHeader: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 },
    sectionTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 16 },
    sectionSubtitle: {
      marginTop: 2,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 11.5,
      lineHeight: 16,
    },
    card: {
      minHeight: 84,
      marginHorizontal: 14,
      marginBottom: 9,
      paddingHorizontal: 13,
      paddingVertical: 12,
      borderRadius: 15,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: accentBorder,
      backgroundColor: glass,
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.circle.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardCopy: { flex: 1, marginHorizontal: 11 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { flex: 1, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
    recurrenceBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: theme.circle.accentSoft,
    },
    recurrenceText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 9 },
    cardDate: { marginTop: 4, color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', fontSize: 11.5 },
    cardMeta: { marginTop: 3, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11.5 },
    emptyState: { minHeight: 330, marginHorizontal: 14, marginTop: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: accentBorder, backgroundColor: glass },
    emptyTitle: { marginTop: 12, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 17 },
    emptyBody: {
      marginTop: 6,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    pressed: { opacity: 0.72 },
  });
}
