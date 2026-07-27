import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import {
  getEventAttendanceReview,
  saveEventAttendanceReview,
} from '../../services/eventService';

const RSVP_LABELS = {
  going: 'Marked Going',
  maybe: 'Marked Maybe',
  not_going: 'Marked Can’t go',
  pending: 'No RSVP',
  invited: 'Invited',
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
  return `${date} · ${startTime}–${endTime}`;
}

function SelectionControl({ selected }) {
  return (
    <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
      {selected ? <Ionicons name="checkmark" size={17} color="#fff" /> : null}
    </View>
  );
}

function MemberRow({ member, selected, onToggle }) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
    >
      <Avatar size={46} name={member.displayName} uri={member.avatarUri} />
      <View style={styles.personCopy}>
        <Text style={styles.personName} numberOfLines={1}>
          {member.displayName}
        </Text>
        <Text style={styles.personMeta} numberOfLines={1}>
          {member.isHost ? 'Host · ' : ''}{RSVP_LABELS[member.rsvpStatus] || 'No RSVP'}
        </Text>
      </View>
      <SelectionControl selected={selected} />
    </Pressable>
  );
}

function GuestRow({ guest, selected, onToggle }) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
    >
      <View style={styles.guestAvatar}>
        <Ionicons
          name={guest.guestType === 'plus_one' ? 'people-outline' : 'person-outline'}
          size={21}
          color={COLORS.text}
        />
      </View>
      <View style={styles.personCopy}>
        <Text style={styles.personName} numberOfLines={1}>{guest.displayName}</Text>
        <Text style={styles.personMeta} numberOfLines={1}>
          {guest.guestType === 'plus_one' ? 'Plus-one' : 'Outside guest'} · {RSVP_LABELS[guest.status] || 'Invited'}
        </Text>
      </View>
      <SelectionControl selected={selected} />
    </Pressable>
  );
}

export function EventAttendanceReviewScreen({ route, navigation }) {
  const { eventId } = route.params || {};
  const [review, setReview] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState(new Set());
  const [selectedGuests, setSelectedGuests] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError('');

    try {
      const nextReview = await getEventAttendanceReview(eventId);
      setReview(nextReview);
      setSelectedMembers(new Set(
        nextReview.members.filter((member) => member.attended).map((member) => member.userId)
      ));
      setSelectedGuests(new Set(
        nextReview.guests.filter((guest) => guest.attended).map((guest) => guest.id)
      ));
    } catch (loadError) {
      setError(loadError?.message || 'Could not open attendance review.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const attendedCount = selectedMembers.size + selectedGuests.size;
  const totalCount = (review?.members?.length || 0) + (review?.guests?.length || 0);
  const wasReviewed = Boolean(review?.event?.attendanceReviewedAt);

  const memberIds = useMemo(() => review?.members?.map((member) => member.userId) || [], [review]);
  const guestIds = useMemo(() => review?.guests?.map((guest) => guest.id) || [], [review]);

  const toggleMember = (userId) => {
    setSelectedMembers((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleGuest = (guestId) => {
    setSelectedGuests((current) => {
      const next = new Set(current);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedMembers(new Set(memberIds));
    setSelectedGuests(new Set(guestIds));
  };

  const clearAll = () => {
    setSelectedMembers(new Set());
    setSelectedGuests(new Set());
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);

    try {
      const result = await saveEventAttendanceReview({
        eventId,
        attendedUserIds: Array.from(selectedMembers),
        attendedGuestIds: Array.from(selectedGuests),
      });

      Alert.alert(
        wasReviewed ? 'Attendance updated' : 'Event completed',
        `${result.attendedCount} ${result.attendedCount === 1 ? 'person was' : 'people were'} marked as attended.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (saveError) {
      Alert.alert(
        'Could not save attendance',
        saveError?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !review) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Preparing attendance…</Text>
      </SafeAreaView>
    );
  }

  if (error && !review) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="people-outline" size={38} color={COLORS.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="checkmark-done-outline" size={27} color={COLORS.text} />
          </View>
          <Text style={styles.heroTitle}>{review?.event?.title || 'Event'}</Text>
          <Text style={styles.heroDate}>
            {formatEventDate(review?.event?.startsAt, review?.event?.endsAt)}
          </Text>
          <Text style={styles.heroBody}>
            Going responses are selected by default until you save. Adjust the list to reflect who actually made it.
          </Text>

          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryValue}>{attendedCount}</Text>
              <Text style={styles.summaryLabel}>Attended</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View>
              <Text style={styles.summaryValue}>{totalCount}</Text>
              <Text style={styles.summaryLabel}>Invited people</Text>
            </View>
          </View>

          <View style={styles.quickActions}>
            <Pressable onPress={selectAll} style={styles.quickButton}>
              <Text style={styles.quickButtonText}>Select all</Text>
            </Pressable>
            <Pressable onPress={clearAll} style={styles.quickButton}>
              <Text style={styles.quickButtonText}>Clear</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Circle members</Text>
          <Text style={styles.sectionCount}>{review?.members?.length || 0}</Text>
        </View>
        <View style={styles.listCard}>
          {(review?.members || []).map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              selected={selectedMembers.has(member.userId)}
              onToggle={() => toggleMember(member.userId)}
            />
          ))}
        </View>

        {(review?.guests || []).length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Outside guests</Text>
              <Text style={styles.sectionCount}>{review.guests.length}</Text>
            </View>
            <View style={styles.listCard}>
              {review.guests.map((guest) => (
                <GuestRow
                  key={guest.id}
                  guest={guest}
                  selected={selectedGuests.has(guest.id)}
                  onToggle={() => toggleGuest(guest.id)}
                />
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.text} />
          <Text style={styles.infoText}>
            This review creates explicit attendance history. It does not change anyone’s original RSVP or grant new profile access.
          </Text>
        </View>

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveButton,
            (pressed || saving) && styles.pressed,
          ]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>
                {wasReviewed ? 'Save Attendance' : 'Complete Event'}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
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
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    backgroundColor: '#f7f7f7',
  },
  stateText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  errorText: {
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 12 },
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
    marginTop: 14,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
  },
  heroDate: {
    marginTop: 5,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  heroBody: {
    marginTop: 9,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  summaryRow: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  summaryValue: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 22 },
  summaryLabel: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: COLORS.border },
  quickActions: { marginTop: 15, flexDirection: 'row', gap: 8 },
  quickButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  quickButtonText: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 11 },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 9,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 17 },
  sectionCount: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  listCard: {
    overflow: 'hidden',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  personRow: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  personMeta: { marginTop: 3, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 10 },
  guestAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  checkCircle: {
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#c7c7cc',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  checkCircleSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  infoCard: {
    marginTop: 22,
    padding: 14,
    borderRadius: 13,
    backgroundColor: '#efefef',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  infoText: {
    flex: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  saveButton: {
    minHeight: 50,
    marginTop: 18,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 14 },
  pressed: { opacity: 0.68 },
});
