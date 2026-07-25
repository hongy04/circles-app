import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import { getEventDetails, respondToEvent } from '../../services/eventService';

const RSVP_OPTIONS = [
  { status: 'going', label: 'Going', icon: 'checkmark-circle-outline' },
  { status: 'maybe', label: 'Maybe', icon: 'help-circle-outline' },
  { status: 'not_going', label: 'Can’t go', icon: 'close-circle-outline' },
];

const STATUS_LABELS = {
  going: 'Going',
  maybe: 'Maybe',
  not_going: 'Can’t go',
  pending: 'No response',
};

function formatEventDate(startsAt, endsAt) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return 'Date unavailable';

  const date = start.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (!endsAt) return `${date} at ${startTime}`;

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${date} at ${startTime}`;

  const endTime = end.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return `${date} · ${startTime}–${endTime}`;

  const endDate = end.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${date} at ${startTime} – ${endDate} at ${endTime}`;
}

function CountCard({ value, label }) {
  return (
    <View style={styles.countCard}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function AttendeeRow({ attendee }) {
  return (
    <View style={styles.attendeeRow}>
      <Avatar
        size={46}
        name={attendee.displayName}
        uri={attendee.avatarUri}
      />
      <View style={styles.attendeeCopy}>
        <Text style={styles.attendeeName} numberOfLines={1}>
          {attendee.isMe ? 'You' : attendee.displayName}
        </Text>
        {attendee.isHost ? (
          <Text style={styles.hostLabel}>Host</Text>
        ) : null}
      </View>
      <View style={styles.statusPill}>
        <Text style={styles.statusPillText}>
          {STATUS_LABELS[attendee.rsvpStatus] || 'No response'}
        </Text>
      </View>
    </View>
  );
}

export function EventDetailScreen({ route }) {
  const { eventId } = route.params || {};
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!eventId) return;
    if (!quiet) setLoading(true);
    setError('');

    try {
      setDetails(await getEventDetails(eventId));
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this event.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const updateRsvp = async (status) => {
    if (updatingStatus || status === details?.event?.viewerRsvpStatus) return;
    setUpdatingStatus(status);

    try {
      await respondToEvent(eventId, status);
      await load({ quiet: true });
    } catch (updateError) {
      Alert.alert(
        'Could not update RSVP',
        updateError?.message || 'Please try again.'
      );
    } finally {
      setUpdatingStatus('');
    }
  };

  const event = details?.event;
  const counts = details?.counts;
  const attendees = details?.attendees || [];

  if (loading && !event) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening event…</Text>
      </SafeAreaView>
    );
  }

  if (error && !event) {
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

  const header = event ? (
    <View>
      <View style={styles.heroCard}>
        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed" size={12} color={COLORS.subtext} />
          <Text style={styles.privacyText}>{event.circleName}</Text>
        </View>

        <Text style={styles.title}>{event.title}</Text>

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.text} />
          </View>
          <Text style={styles.detailText}>
            {formatEventDate(event.startsAt, event.endsAt)}
          </Text>
        </View>

        {event.locationName ? (
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="location-outline" size={20} color={COLORS.text} />
            </View>
            <Text style={styles.detailText}>{event.locationName}</Text>
          </View>
        ) : null}

        <View style={styles.detailRow}>
          <Avatar size={40} name={event.hostName} uri={event.hostAvatar} />
          <View style={styles.hostCopy}>
            <Text style={styles.hostName}>{event.hostName}</Text>
            <Text style={styles.hostBody}>Hosting for this Circle</Text>
          </View>
        </View>

        {event.description ? (
          <Text style={styles.description}>{event.description}</Text>
        ) : null}
      </View>

      <View style={styles.rsvpCard}>
        <Text style={styles.rsvpTitle}>Are you going?</Text>
        <Text style={styles.rsvpBody}>
          Your answer is visible only to current members of this event’s Circle.
        </Text>

        <View style={styles.rsvpButtons}>
          {RSVP_OPTIONS.map((option) => {
            const selected = event.viewerRsvpStatus === option.status;
            const busy = updatingStatus === option.status;
            return (
              <Pressable
                key={option.status}
                onPress={() => updateRsvp(option.status)}
                disabled={Boolean(updatingStatus)}
                style={({ pressed }) => [
                  styles.rsvpButton,
                  selected && styles.rsvpButtonSelected,
                  (pressed || busy) && styles.pressed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={selected ? '#fff' : COLORS.text} />
                ) : (
                  <Ionicons
                    name={option.icon}
                    size={19}
                    color={selected ? '#fff' : COLORS.text}
                  />
                )}
                <Text style={[
                  styles.rsvpButtonText,
                  selected && styles.rsvpButtonTextSelected,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.countsRow}>
        <CountCard value={counts?.going || 0} label="Going" />
        <CountCard value={counts?.maybe || 0} label="Maybe" />
        <CountCard value={counts?.pending || 0} label="Waiting" />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Circle responses</Text>
        <Text style={styles.sectionCount}>{counts?.attendeeCount || 0} people</Text>
      </View>
    </View>
  ) : null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={attendees}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={header}
        renderItem={({ item }) => <AttendeeRow attendee={item} />}
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
    padding: 16,
    paddingBottom: 46,
  },
  heroCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  privacyText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
  title: {
    marginTop: 10,
    marginBottom: 17,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 25,
    lineHeight: 31,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 12,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  detailText: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
  },
  hostCopy: { flex: 1 },
  hostName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  hostBody: {
    marginTop: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  description: {
    marginTop: 18,
    paddingTop: 17,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  rsvpCard: {
    marginTop: 12,
    padding: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  rsvpTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  rsvpBody: {
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  rsvpButtons: { flexDirection: 'row', gap: 7, marginTop: 15 },
  rsvpButton: {
    flex: 1,
    minHeight: 47,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  rsvpButtonSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  rsvpButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
  rsvpButtonTextSelected: { color: '#fff' },
  countsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  countCard: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
  },
  countValue: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 19,
  },
  countLabel: {
    marginTop: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 9,
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
  attendeeRow: {
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeCopy: { flex: 1, marginHorizontal: 11 },
  attendeeName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  hostLabel: {
    marginTop: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#efefef',
  },
  statusPillText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
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
