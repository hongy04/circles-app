import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../../theme/colors';
import { fetchProfileEventDirectory } from '../../services/profileDirectoryService';

const RSVP_LABELS = {
  going: 'Going',
  maybe: 'Maybe',
  not_going: 'Can’t go',
};

function formatDate(startsAt) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function EventCard({ event, onPress, shared = false }) {
  const circleCopy = event.circleNames.length
    ? event.circleNames.join(' + ')
    : 'Private event';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.dateBadge}>
        <Ionicons
          name={shared ? 'people-outline' : 'calendar-outline'}
          size={22}
          color={COLORS.text}
        />
      </View>

      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {formatDate(event.startsAt)} · hosted by {event.hostName}
        </Text>
        <Text style={styles.cardContext} numberOfLines={1}>{circleCopy}</Text>

        <View style={styles.chipRow}>
          {event.rsvpStatus ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {RSVP_LABELS[event.rsvpStatus] || event.rsvpStatus}
              </Text>
            </View>
          ) : null}
          {event.photoCount > 0 ? (
            <View style={styles.chip}>
              <Ionicons name="images-outline" size={13} color={COLORS.subtext} />
              <Text style={styles.chipText}>
                {event.photoCount} {event.photoCount === 1 ? 'photo' : 'photos'}
              </Text>
            </View>
          ) : null}
          {event.completed ? (
            <View style={styles.chip}>
              <Ionicons name="checkmark-circle-outline" size={13} color={COLORS.subtext} />
              <Text style={styles.chipText}>Attended</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={19} color={COLORS.subtext} />
    </Pressable>
  );
}

function EmptySection({ icon, title, body }) {
  return (
    <View style={styles.emptySection}>
      <Ionicons name={icon} size={30} color={COLORS.subtext} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function ProfileEventsScreen({ route, navigation }) {
  const userId = route?.params?.userId || null;
  const profileName = route?.params?.profileName || 'Profile';
  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      setDirectory(await fetchProfileEventDirectory(userId));
    } catch (loadError) {
      setError(loadError?.message || 'Could not load events.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    navigation.setOptions({
      title: userId ? `Shared with ${profileName}` : 'Your events',
    });
    load();
  }, [load, navigation, profileName, userId]);

  const openEvent = (event) => {
    if (event.accessMode !== 'full') {
      navigation.navigate('ClaimedEventConnections', {
        eventId: event.id,
        eventTitle: event.title,
      });
      return;
    }

    navigation.navigate('MainTabs', {
      screen: 'Circles',
      params: {
        screen: 'EventDetail',
        params: { eventId: event.id },
      },
    });
  };

  if (loading && !directory) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading events…</Text>
      </View>
    );
  }

  if (error && !directory) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={38} color={COLORS.subtext} />
        <Text style={styles.errorTitle}>Events unavailable</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const isSelf = directory?.mode === 'self';
  const upcoming = directory?.upcoming || [];
  const attended = directory?.attended || [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load({ refresh: true })}
          tintColor={COLORS.text}
        />
      )}
    >
      <View style={styles.introCard}>
        <Ionicons
          name={isSelf ? 'calendar-outline' : 'people-outline'}
          size={25}
          color={COLORS.text}
        />
        <View style={styles.introCopy}>
          <Text style={styles.introTitle}>
            {isSelf ? 'Your private event history' : 'Events you both attended'}
          </Text>
          <Text style={styles.introBody}>
            {isSelf
              ? 'Only you can see this complete directory. Events remain attached to their original Circles.'
              : 'Only reviewed events where both of you were confirmed are shown.'}
          </Text>
        </View>
      </View>

      {isSelf ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming</Text>
          {upcoming.length ? upcoming.map((event) => (
            <EventCard
              key={`upcoming-${event.id}`}
              event={event}
              onPress={() => openEvent(event)}
            />
          )) : (
            <EmptySection
              icon="calendar-clear-outline"
              title="No upcoming events"
              body="Events from your Circles will appear here so you do not have to remember which Circle created them."
            />
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {isSelf ? 'Attended' : 'Shared events'}
        </Text>
        {attended.length ? attended.map((event) => (
          <EventCard
            key={`attended-${event.id}`}
            event={event}
            shared={!isSelf}
            onPress={() => openEvent(event)}
          />
        )) : (
          <EmptySection
            icon="footsteps-outline"
            title={isSelf ? 'No reviewed attendance yet' : 'No shared events yet'}
            body={isSelf
              ? 'After a host confirms attendance, that gathering becomes part of your private history.'
              : 'Only events where both people were confirmed as present appear here.'}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorTitle: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  errorBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  introCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  introCopy: { flex: 1, marginLeft: 12 },
  introTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  introBody: {
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  section: { marginTop: 22, gap: 10 },
  sectionTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
    marginBottom: 2,
  },
  card: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    padding: 13,
  },
  dateBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  cardCopy: { flex: 1, marginHorizontal: 12 },
  cardTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  cardMeta: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  cardContext: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 24,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    marginTop: 9,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 5,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  pressed: { opacity: 0.68 },
});
