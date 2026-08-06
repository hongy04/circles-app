import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { CircleBackdrop } from '../../components/circles/CircleBackdrop';
import { ContinuityLoadingCard } from '../../components/ContinuityLoadingCard';
import { EventAlbumMemoryCover } from '../../components/events/EventAlbumMemoryCover';
import { MemoryLiftSurface } from '../../components/memories/MemoryLiftSurface';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { listCircleEvents } from '../../services/eventService';
import { listCircleAvailabilityPolls } from '../../services/availabilityPollService';
import { trackAppEvent } from '../../services/analyticsService';
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
} from '../../services/featureFlagService';
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

const CIRCLE_EVENTS_FOCUS_FRESH_MS = 10_000;

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

function EventCard({ event, memoryIndex = 0, onPress, styles, theme }) {
  const endTime = new Date(event.endsAt || event.startsAt).getTime();
  const isPast = event.status === 'completed' || endTime < Date.now();

  if (isPast) {
    const memoryReady = Boolean(event.attendanceReviewedAt || event.status === 'completed');
    const attended = event.attendanceReviewedAt
      ? Number(event.attendedCount || 0)
      : Number(event.goingCount || 0);
    const photoCount = Number(event.photoCount || 0);
    const memoryMeta = [
      event.attendanceReviewedAt
        ? `${attended} ${attended === 1 ? 'person' : 'people'}`
        : `${attended} marked going`,
      photoCount > 0 ? `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}` : null,
    ].filter(Boolean).join(' · ');

    const memoryHeight = [190, 208, 196, 214][memoryIndex % 4];

    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.memoryEventCard, pressed && styles.pressed]}
      >
        <EventAlbumMemoryCover
          appearanceKey={event.appearanceKey || 'circle'}
          coverUri={event.coverUrl || null}
          previewUrls={event.previewUrls || []}
          height={memoryHeight}
          borderRadius={24}
        >
          <View style={styles.memoryArtworkOverlay}>
            <View style={styles.memoryBadge}>
              <Ionicons name="sparkles" size={11} color="#fff" />
              <Text style={styles.memoryBadgeText}>{memoryReady ? 'MEMORY' : 'AFTER GATHERING'}</Text>
            </View>
          </View>

          <View style={styles.memoryEventCopy}>
            <Text style={styles.memoryEventTitle} numberOfLines={2}>{event.title}</Text>
            <Text style={styles.memoryEventDate} numberOfLines={1}>
              {formatEventDate(event.startsAt, event.endsAt)}
            </Text>
            {event.locationName ? (
              <View style={styles.memoryMetaRow}>
                <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.86)" />
                <Text style={styles.memoryMetaText} numberOfLines={1}>{event.locationName}</Text>
              </View>
            ) : null}
            <View style={styles.memoryFooterRow}>
              <Text style={styles.memorySummaryText} numberOfLines={1}>{memoryMeta}</Text>
              <View style={styles.viewMemoryPill}>
                <Text style={styles.viewMemoryText}>{memoryReady ? 'View memory' : 'Open gathering'}</Text>
                <Ionicons name="chevron-forward" size={12} color="#fff" />
              </View>
            </View>
          </View>
        </EventAlbumMemoryCover>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
    >
      <View style={styles.dateIcon}>
        <Ionicons
          name="calendar-outline"
          size={23}
          color={theme.colors.text}
        />
      </View>

      <View style={styles.eventCopy}>
        <View style={styles.titleRow}>
          <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
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
  const memoryScrollY = useSharedValue(0);
  const handleMemoryScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      memoryScrollY.value = event.contentOffset.y;
    },
  });
  const cachedEvents = readNavigationCache(navigationCacheKeys.circleEvents(conversationId));
  const cachedPolls = readNavigationCache(navigationCacheKeys.circlePolls(conversationId));
  const hasWarmSnapshot = Array.isArray(cachedEvents) && Array.isArray(cachedPolls);
  const [events, setEvents] = useState(Array.isArray(cachedEvents) ? cachedEvents : []);
  const [polls, setPolls] = useState(Array.isArray(cachedPolls) ? cachedPolls : []);
  const [pollsEnabled, setPollsEnabled] = useState(true);
  const [loading, setLoading] = useState(!hasWarmSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const hasLoadedRef = useRef(hasWarmSnapshot);
  const lastRefreshAtRef = useRef(hasWarmSnapshot ? Date.now() : 0);
  const loadInFlightRef = useRef(null);

  const load = useCallback(async ({ quiet = false, force = false } = {}) => {
    if (!conversationId) return;
    if (loadInFlightRef.current) return loadInFlightRef.current;
    if (!quiet) setLoading(true);
    setError('');
    setPollError('');

    const request = (async () => {
      try {
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
          writeNavigationCache(navigationCacheKeys.circleEvents(conversationId), results[0].value);
          results[0].value.forEach((event) => {
            writeNavigationCache(navigationCacheKeys.eventSummary(event.id), event);
          });
        } else {
          setError(results[0].reason?.message || 'Could not load this Circle’s events.');
        }

        if (results[1].status === 'fulfilled') {
          setPolls(results[1].value);
          writeNavigationCache(navigationCacheKeys.circlePolls(conversationId), results[1].value);
          results[1].value.forEach((poll) => {
            writeNavigationCache(navigationCacheKeys.pollSummary(poll.id), poll);
          });
        } else {
          setPollError(results[1].reason?.message || 'Availability polls could not load.');
        }

        if (results.some((result) => result.status === 'fulfilled')) {
          lastRefreshAtRef.current = Date.now();
        }
      } catch (loadError) {
        setError(loadError?.message || 'Could not load this Circle’s events.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    })();

    loadInFlightRef.current = request.finally(() => {
      loadInFlightRef.current = null;
    });
    return loadInFlightRef.current;
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      const warmEvents = readNavigationCache(navigationCacheKeys.circleEvents(conversationId));
      if (Array.isArray(warmEvents)) setEvents(warmEvents);
      const isFresh = hasLoadedRef.current
        && Date.now() - lastRefreshAtRef.current < CIRCLE_EVENTS_FOCUS_FRESH_MS;
      if (!isFresh) {
        void load({ quiet: hasLoadedRef.current }).finally(() => {
          hasLoadedRef.current = true;
        });
      }
    }, [load])
  );

  const upcomingEvents = useMemo(
    () => events.filter((event) => (
      event.status !== 'completed' && new Date(event.endsAt || event.startsAt).getTime() >= Date.now()
    )),
    [events]
  );
  const pastEvents = useMemo(
    () => events.filter((event) => (
      event.status === 'completed' || new Date(event.endsAt || event.startsAt).getTime() < Date.now()
    )),
    [events]
  );
  const eventRows = useMemo(() => {
    if (events.length === 0) return [];
    return [
      { rowType: 'section', id: 'upcoming-section', title: 'Upcoming events', count: upcomingEvents.length },
      ...upcomingEvents.map((event) => ({ rowType: 'event', event })),
      { rowType: 'section', id: 'past-section', title: 'Past events', count: pastEvents.length },
      ...pastEvents.map((event, memoryIndex) => ({ rowType: 'event', event, memoryIndex })),
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
    writeNavigationCache(navigationCacheKeys.eventSummary(event.id), event);
    navigation.navigate('EventDetail', { eventId: event.id, eventTitle: event.title, conversationId, circleName });
  };

  const openPoll = (poll) => {
    void trackAppEvent('event_poll_opened', {
      surface: 'circle_events',
      poll_status: poll.status,
    });
    writeNavigationCache(navigationCacheKeys.pollSummary(poll.id), poll);
    navigation.navigate('AvailabilityPollDetail', { pollId: poll.id, pollTitle: poll.title, conversationId, circleName });
  };

  const header = (
    <View>
      <View style={styles.topActions}>
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
      </View>

      {pollsEnabled ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Availability polls</Text>
            <Text style={styles.sectionCount}>{openPollCount} open</Text>
          </View>

          {loading && polls.length === 0 && !pollError ? (
            <ContinuityLoadingCard
              compact
              label="Loading date polls…"
              icon="options-outline"
            />
          ) : pollError ? (
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

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <CircleBackdrop conversationId={conversationId} imageTintOpacity={0.07} />
      <View pointerEvents="none" style={styles.wallpaperSoftener} />
      <Animated.FlatList
        data={eventRows}
        keyExtractor={(item) => item.rowType === 'section' ? item.id : item.event.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          if (item.rowType === 'section') {
            return (
              <View style={styles.eventSectionHeader}>
                <Text style={styles.sectionTitle}>{item.title}</Text>
                <Text style={styles.sectionCount}>{item.count}</Text>
              </View>
            );
          }

          const card = (
            <EventCard
              event={item.event}
              memoryIndex={item.memoryIndex || 0}
              onPress={() => openEvent(item.event)}
              styles={styles}
              theme={theme}
            />
          );

          if (!Number.isInteger(item.memoryIndex)) return card;

          return (
            <MemoryLiftSurface
              scrollY={memoryScrollY}
              focusRatio={0.56}
              minScale={0.968}
              maxScale={1.016}
              lift={7}
              style={styles.memoryLiftShell}
            >
              {card}
            </MemoryLiftSurface>
          );
        }}
        onScroll={handleMemoryScroll}
        scrollEventThrottle={16}
        ListEmptyComponent={loading ? (
          <ContinuityLoadingCard
            label="Loading Circle events…"
            body="You can stay on this page while the event list catches up."
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
            tintColor={theme.circle.accent}
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
  const glass = rgba(theme.colors.surface, 0.76);
  const glassStrong = rgba(theme.colors.surface, 0.88);
  const glassQuiet = rgba(theme.colors.surface, 0.58);
  const accentBorder = rgba(theme.circle.accent, 0.20);

  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
  wallpaperSoftener: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: rgba(theme.colors.surface, 0.045),
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 46,
    flexGrow: 1,
  },
  topActions: {
    marginTop: 2,
    padding: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: rgba(theme.circle.accent, 0.24),
    backgroundColor: glassStrong,
    shadowColor: theme.colors.text,
    shadowOpacity: 0.045,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  actionRow: { flexDirection: 'row', gap: 9 },
  pollButton: {
    minHeight: 44,
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: rgba(theme.circle.accent, 0.24),
    backgroundColor: rgba(theme.colors.surface, 0.67),
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
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.welcome.brandInk,
    shadowColor: theme.welcome.brandInk,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  createButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  eventSectionHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 10,
    paddingHorizontal: 11,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: rgba(theme.circle.accent, 0.15),
    backgroundColor: glassQuiet,
  },
  sectionHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 10,
    paddingHorizontal: 11,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: rgba(theme.circle.accent, 0.15),
    backgroundColor: glassQuiet,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  sectionCount: {
    overflow: 'hidden',
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: rgba(theme.circle.accent, 0.10),
  },
  pollCard: {
    minHeight: 104,
    marginBottom: 9,
    padding: 14,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glass,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: theme.colors.text,
    shadowOpacity: 0.035,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  pollIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: rgba(theme.circle.accent, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: rgba(theme.circle.accent, 0.15),
  },
  pollCopy: { flex: 1 },
  pollTitle: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  pollState: {
    color: theme.circle.accent,
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
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glass,
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
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glassStrong,
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
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glass,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: theme.colors.text,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  memoryLiftShell: { marginBottom: 12 },
  memoryEventCard: {
    borderRadius: 24,
    backgroundColor: glassStrong,
    shadowColor: '#071725',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  memoryArtworkOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  memoryBadge: {
    minHeight: 26,
    paddingHorizontal: 9,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15,23,42,0.46)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  memoryBadgeText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.7 },
  memoryEventCopy: { position: 'absolute', left: 15, right: 15, bottom: 14 },
  memoryEventTitle: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 22, lineHeight: 26, textShadowColor: 'rgba(0,0,0,0.28)', textShadowRadius: 8 },
  memoryEventDate: { marginTop: 3, color: 'rgba(255,255,255,0.92)', fontFamily: 'Manrope_600SemiBold', fontSize: 11.5 },
  memoryMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  memoryMetaText: { flex: 1, color: 'rgba(255,255,255,0.84)', fontFamily: 'Manrope_400Regular', fontSize: 11 },
  memoryFooterRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  memorySummaryText: { flex: 1, color: 'rgba(255,255,255,0.84)', fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
  viewMemoryPill: {
    minHeight: 29,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(5,16,30,0.34)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.26)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  viewMemoryText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 9.5 },
  dateIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: rgba(theme.circle.accent, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: rgba(theme.circle.accent, 0.15),
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
    backgroundColor: rgba(theme.circle.accent, 0.11),
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
    paddingVertical: 48,
    marginTop: 12,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glassStrong,
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
    backgroundColor: theme.circle.profileBackground,
  },
  stateCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glassStrong,
  },
  stateIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: rgba(theme.circle.accent, 0.12),
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
    borderRadius: 11,
    backgroundColor: theme.welcome.brandInk,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.74, transform: [{ scale: 0.995 }] },
  });
}
