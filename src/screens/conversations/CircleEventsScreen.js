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
import { listCircleEvents } from '../../services/eventService';
import { trackAppEvent } from '../../services/analyticsService';

const RSVP_LABELS = {
  pending: 'No response',
  going: 'Going',
  maybe: 'Maybe',
  not_going: 'Can’t go',
};

function formatEventDate(startsAt, endsAt) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return 'Date unavailable';

  const date = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(start.getFullYear() !== new Date().getFullYear()
      ? { year: 'numeric' }
      : {}),
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (!endsAt) return `${date} · ${startTime}`;

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${date} · ${startTime}`;

  const endTime = end.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} · ${startTime}–${endTime}`;
}

function EventCard({ event, onPress }) {
  const isPast = new Date(event.startsAt).getTime() < Date.now();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.dateIcon}>
        <Ionicons
          name={isPast ? 'checkmark-circle-outline' : 'calendar-outline'}
          size={23}
          color={COLORS.text}
        />
      </View>

      <View style={styles.eventCopy}>
        <View style={styles.titleRow}>
          <Text style={styles.eventTitle} numberOfLines={1}>
            {event.title}
          </Text>
          {isPast ? <Text style={styles.pastLabel}>Past</Text> : null}
        </View>

        <Text style={styles.eventDate} numberOfLines={1}>
          {formatEventDate(event.startsAt, event.endsAt)}
        </Text>

        {event.locationName ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={COLORS.subtext} />
            <Text style={styles.metaText} numberOfLines={1}>
              {event.locationName}
            </Text>
          </View>
        ) : null}

        <View style={styles.summaryRow}>
          <View style={styles.rsvpPill}>
            <Text style={styles.rsvpPillText}>
              {RSVP_LABELS[event.viewerRsvpStatus] || 'No response'}
            </Text>
          </View>
          <Text style={styles.countText}>
            {event.goingCount} going · {event.maybeCount} maybe
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={19} color="#c7c7cc" />
    </Pressable>
  );
}

export function CircleEventsScreen({ route, navigation }) {
  const { conversationId, circleName = 'Circle' } = route.params || {};
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');

    try {
      setEvents(await listCircleEvents(conversationId));
    } catch (loadError) {
      setError(loadError?.message || 'Could not load this Circle’s events.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const upcomingCount = useMemo(
    () => events.filter((event) => new Date(event.startsAt).getTime() >= Date.now()).length,
    [events]
  );

  const openEvent = (event) => {
    void trackAppEvent('event_opened', {
      surface: 'circle_events',
      rsvp_status: event.viewerRsvpStatus,
    });
    navigation.navigate('EventDetail', { eventId: event.id });
  };

  const header = (
    <View>
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="calendar-clear-outline" size={28} color={COLORS.text} />
        </View>
        <Text style={styles.heroTitle}>Plans for {circleName}</Text>
        <Text style={styles.heroBody}>
          Make a real plan, keep the details in one private place, and let every
          current Circle member answer for themselves.
        </Text>
        <Pressable
          onPress={() => navigation.navigate('CreateEvent', {
            conversationId,
            circleName,
          })}
          style={({ pressed }) => [
            styles.createButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="add" size={19} color="#fff" />
          <Text style={styles.createButtonText}>Create Event</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Circle events</Text>
        <Text style={styles.sectionCount}>{upcomingCount} upcoming</Text>
      </View>
    </View>
  );

  if (loading && events.length === 0) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Loading events…</Text>
      </SafeAreaView>
    );
  }

  if (error && events.length === 0) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="calendar-outline" size={38} color={COLORS.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <EventCard event={item} onPress={() => openEvent(item)} />
        )}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={42} color={COLORS.subtext} />
            <Text style={styles.emptyTitle}>No plans yet</Text>
            <Text style={styles.emptyBody}>
              Create the first event for this Circle. Members can answer Going,
              Maybe, or Can’t go without leaving the private group.
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
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 46,
    flexGrow: 1,
  },
  heroCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  heroTitle: {
    marginTop: 15,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 21,
  },
  heroBody: {
    marginTop: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  createButton: {
    minHeight: 44,
    marginTop: 18,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
  },
  createButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  sectionCount: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  eventCard: {
    minHeight: 126,
    marginBottom: 10,
    padding: 14,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  eventCopy: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventTitle: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  pastLabel: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  eventDate: {
    marginTop: 3,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  metaText: {
    flex: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
  },
  rsvpPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#eeeeee',
  },
  rsvpPillText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  countText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 54,
  },
  emptyTitle: {
    marginTop: 13,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  emptyBody: {
    maxWidth: 430,
    marginTop: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: COLORS.bg,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
    maxWidth: 420,
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.72 },
});
