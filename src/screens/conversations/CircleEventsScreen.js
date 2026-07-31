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
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { listCircleEvents } from '../../services/eventService';
import { listCircleAvailabilityPolls } from '../../services/availabilityPollService';
import { trackAppEvent } from '../../services/analyticsService';
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
} from '../../services/featureFlagService';

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

function EventCard({ event, onPress, styles, theme }) {
  const startTime = new Date(event.startsAt).getTime();
  const isPast = event.status === 'completed' || startTime < Date.now();
  const historyLabel = event.attendanceReviewedAt ? 'Reviewed' : 'Past';
  const historySummary = event.attendanceReviewedAt
    ? `${event.attendedCount} attended`
    : `${event.goingCount} marked going`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
    >
      <View style={styles.dateIcon}>
        <Ionicons
          name={isPast ? 'checkmark-circle-outline' : 'calendar-outline'}
          size={23}
          color={theme.colors.text}
        />
      </View>

      <View style={styles.eventCopy}>
        <View style={styles.titleRow}>
          <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
          {isPast ? <Text style={styles.pastLabel}>{historyLabel}</Text> : null}
        </View>

        <Text style={styles.eventDate} numberOfLines={1}>
          {formatEventDate(event.startsAt, event.endsAt)}
        </Text>

        {event.circleCount > 1 ? (
          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={14} color={theme.colors.subtext} />
            <Text style={styles.metaText} numberOfLines={1}>
              Shared across {event.circleCount} Circles
            </Text>
          </View>
        ) : null}

        {event.locationName ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={theme.colors.subtext} />
            <Text style={styles.metaText} numberOfLines={1}>{event.locationName}</Text>
          </View>
        ) : null}

        <View style={styles.summaryRow}>
          {isPast ? (
            <>
              <View style={styles.rsvpPill}>
                <Text style={styles.rsvpPillText}>
                  {event.status === 'completed' ? 'Completed' : 'Past event'}
                </Text>
              </View>
              <Text style={styles.countText}>{historySummary}</Text>
            </>
          ) : (
            <>
              <View style={styles.rsvpPill}>
                <Text style={styles.rsvpPillText}>
                  {RSVP_LABELS[event.viewerRsvpStatus] || 'No response'}
                </Text>
              </View>
              <Text style={styles.countText}>
                {event.goingCount} going · {event.maybeCount} maybe
              </Text>
            </>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={19} color="#c7c7cc" />
    </Pressable>
  );
}

function PollCard({ poll, onPress, styles, theme }) {
  const finalized = poll.status === 'finalized';
  const responseLabel = `${poll.responseCount}/${poll.memberCount} responded`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pollCard, pressed && styles.pressed]}
    >
      <View style={styles.pollIcon}>
        <Ionicons
          name={finalized ? 'checkmark-done-outline' : 'options-outline'}
          size={22}
          color={theme.colors.text}
        />
      </View>
      <View style={styles.pollCopy}>
        <View style={styles.titleRow}>
          <Text style={styles.pollTitle} numberOfLines={1}>{poll.title}</Text>
          <Text style={styles.pollState}>{finalized ? 'Finalized' : 'Open'}</Text>
        </View>
        <Text style={styles.pollMeta} numberOfLines={1}>
          {poll.optionCount} possible times · {responseLabel}
        </Text>
        <Text style={styles.pollViewerState}>
          {finalized
            ? 'Open the chosen event'
            : poll.viewerResponded
              ? 'Your availability is saved'
              : 'Add your availability'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color="#c7c7cc" />
    </Pressable>
  );
}

function CircleEventsContent({ route, navigation }) {
  const { conversationId, circleName = 'Circle' } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [events, setEvents] = useState([]);
  const [polls, setPolls] = useState([]);
  const [pollsEnabled, setPollsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');
    setPollError('');

    const availabilityEnabled = await isFeatureEnabled(
      FEATURE_FLAGS.EVENT_AVAILABILITY_POLLS
    );
    setPollsEnabled(availabilityEnabled);

    const results = await Promise.allSettled([
      listCircleEvents(conversationId),
      availabilityEnabled
        ? listCircleAvailabilityPolls(conversationId)
        : Promise.resolve([]),
    ]);

    if (results[0].status === 'fulfilled') {
      setEvents(results[0].value);
    } else {
      setError(results[0].reason?.message || 'Could not load this Circle’s events.');
    }

    if (results[1].status === 'fulfilled') {
      setPolls(results[1].value);
    } else {
      setPollError(results[1].reason?.message || 'Availability polls could not load.');
    }

    setLoading(false);
    setRefreshing(false);
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const upcomingEvents = useMemo(
    () => events.filter((event) => (
      event.status !== 'completed' && new Date(event.startsAt).getTime() >= Date.now()
    )),
    [events]
  );
  const pastEvents = useMemo(
    () => events.filter((event) => (
      event.status === 'completed' || new Date(event.startsAt).getTime() < Date.now()
    )),
    [events]
  );
  const eventRows = useMemo(() => {
    if (events.length === 0) return [];
    return [
      { rowType: 'section', id: 'upcoming-section', title: 'Upcoming events', count: upcomingEvents.length },
      ...upcomingEvents.map((event) => ({ rowType: 'event', event })),
      { rowType: 'section', id: 'past-section', title: 'Past events', count: pastEvents.length },
      ...pastEvents.map((event) => ({ rowType: 'event', event })),
    ];
  }, [events, pastEvents, upcomingEvents]);
  const openPollCount = useMemo(
    () => polls.filter((poll) => poll.status === 'open').length,
    [polls]
  );

  const openEvent = (event) => {
    void trackAppEvent('event_opened', {
      surface: 'circle_events',
      rsvp_status: event.viewerRsvpStatus,
      circle_count: event.circleCount,
    });
    navigation.navigate('EventDetail', { eventId: event.id, conversationId, circleName });
  };

  const openPoll = (poll) => {
    void trackAppEvent('event_poll_opened', {
      surface: 'circle_events',
      poll_status: poll.status,
    });
    navigation.navigate('AvailabilityPollDetail', { pollId: poll.id, conversationId, circleName });
  };

  const header = (
    <View>
      <LinearGradient
          colors={theme.circle.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
        <View style={styles.heroIcon}>
          <Ionicons name="calendar-clear-outline" size={28} color={theme.colors.text} />
        </View>
        <Text style={styles.heroTitle}>Plans for {circleName}</Text>
        <Text style={styles.heroBody}>
          Poll the Circle when the date is uncertain, or create a private event
          when the plan is already decided.
        </Text>

        <View style={styles.actionRow}>
          {pollsEnabled ? (
            <Pressable
              onPress={() => navigation.navigate('CreateAvailabilityPoll', {
                conversationId,
                circleName,
              })}
              style={({ pressed }) => [styles.pollButton, pressed && styles.pressed]}
            >
              <Ionicons name="options-outline" size={18} color={theme.colors.text} />
              <Text style={styles.pollButtonText}>Poll Dates</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => navigation.navigate('CreateEvent', {
              conversationId,
              circleName,
            })}
            style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={19} color="#fff" />
            <Text style={styles.createButtonText}>Create Event</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {pollsEnabled ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Availability polls</Text>
            <Text style={styles.sectionCount}>{openPollCount} open</Text>
          </View>

          {pollError ? (
            <View style={styles.inlineError}>
              <Ionicons name="alert-circle-outline" size={18} color={theme.colors.subtext} />
              <Text style={styles.inlineErrorText}>{pollError}</Text>
            </View>
          ) : polls.length > 0 ? (
            polls.map((poll) => (
              <PollCard key={poll.id} poll={poll} onPress={() => openPoll(poll)} styles={styles} theme={theme} />
            ))
          ) : (
            <View style={styles.pollEmptyCard}>
              <Text style={styles.pollEmptyTitle}>No date polls yet</Text>
              <Text style={styles.pollEmptyBody}>
                Start one when the Circle knows the plan but not the best time.
              </Text>
            </View>
          )}
        </>
      ) : null}
    </View>
  );

  if (loading && events.length === 0 && polls.length === 0) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Loading plans…</Text>
      </SafeAreaView>
    );
  }

  if (error && events.length === 0 && polls.length === 0) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="calendar-outline" size={38} color={theme.colors.text} />
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
        data={eventRows}
        keyExtractor={(item) => item.rowType === 'section' ? item.id : item.event.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => item.rowType === 'section' ? (
          <View style={styles.eventSectionHeader}>
            <Text style={styles.sectionTitle}>{item.title}</Text>
            <Text style={styles.sectionCount}>{item.count}</Text>
          </View>
        ) : (
          <EventCard event={item.event} onPress={() => openEvent(item.event)} styles={styles} theme={theme} />
        )}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={42} color={theme.colors.subtext} />
            <Text style={styles.emptyTitle}>No events yet</Text>
            <Text style={styles.emptyBody}>
              Finalize an availability poll or create an event directly. Members
              can then answer Going, Maybe, or Can’t go.
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
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

export function CircleEventsScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CircleEventsContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
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
    position: 'relative',
    overflow: 'hidden',
    padding: 20,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    shadowColor: theme.circle.accent,
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  heroTitle: {
    marginTop: 15,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 21,
  },
  heroBody: {
    marginTop: 7,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  actionRow: { marginTop: 18, flexDirection: 'row', gap: 9 },
  pollButton: {
    minHeight: 44,
    flex: 1,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pollButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  createButton: {
    minHeight: 44,
    flex: 1,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.welcome.brandInk,
  },
  createButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  eventSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 10,
    paddingHorizontal: 2,
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
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  sectionCount: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  pollCard: {
    minHeight: 104,
    marginBottom: 9,
    padding: 14,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pollIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  pollCopy: { flex: 1 },
  pollTitle: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  pollState: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
    textTransform: 'uppercase',
  },
  pollMeta: {
    marginTop: 4,
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  pollViewerState: {
    marginTop: 5,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  pollEmptyCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
  },
  pollEmptyTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  pollEmptyBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  inlineError: {
    minHeight: 62,
    padding: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineErrorText: {
    flex: 1,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  eventCard: {
    minHeight: 126,
    marginBottom: 10,
    padding: 14,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.circle.accentSoft,
  },
  eventCopy: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventTitle: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  pastLabel: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  eventDate: {
    marginTop: 3,
    color: theme.colors.text,
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
    color: theme.colors.subtext,
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
    backgroundColor: theme.circle.accentSoft,
  },
  rsvpPillText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  countText: {
    color: theme.colors.subtext,
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
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  emptyBody: {
    maxWidth: 430,
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
    padding: 30,
    backgroundColor: theme.colors.surface,
  },
  stateText: {
    marginTop: 10,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
    maxWidth: 420,
    marginTop: 12,
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.welcome.brandInk,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.72 },
  });
}
