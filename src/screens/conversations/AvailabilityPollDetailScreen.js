import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '../../components/Avatar';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  finalizeAvailabilityPoll,
  getAvailabilityPollDetails,
  respondToAvailabilityPoll,
} from '../../services/availabilityPollService';

function formatOptionDate(startsAt, endsAt) {
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

function availablePeopleLabel(people) {
  if (!people?.length) return 'No one has selected this yet';
  const names = people.map((person) => (person.isMe ? 'You' : person.displayName));
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

function PollOptionCard({
  option,
  selected,
  disabled,
  canManage,
  onToggle,
  onFinalize,
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[
      styles.optionCard,
      selected && styles.optionCardSelected,
      option.isFinalized && styles.optionCardFinalized,
    ]}>
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        style={({ pressed }) => [styles.optionMain, pressed && !disabled && styles.pressed]}
      >
        <View style={[
          styles.checkbox,
          selected && styles.checkboxSelected,
          disabled && !option.isFinalized && styles.checkboxDisabled,
        ]}>
          {selected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
        </View>

        <View style={styles.optionCopy}>
          <Text style={styles.optionDate}>{formatOptionDate(option.startsAt, option.endsAt)}</Text>
          <View style={styles.availabilityRow}>
            <Ionicons name="people-outline" size={14} color={theme.colors.subtext} />
            <Text style={styles.availabilityCount}>
              {option.availableCount} available
            </Text>
          </View>
          <Text style={styles.peopleNames} numberOfLines={2}>
            {availablePeopleLabel(option.availablePeople)}
          </Text>
        </View>

        {option.isFinalized ? (
          <View style={styles.finalizedPill}>
            <Text style={styles.finalizedPillText}>Chosen</Text>
          </View>
        ) : null}
      </Pressable>

      {canManage && !disabled ? (
        <Pressable
          onPress={onFinalize}
          style={({ pressed }) => [styles.finalizeButton, pressed && styles.pressed]}
        >
          <Ionicons name="calendar-outline" size={16} color={theme.colors.text} />
          <Text style={styles.finalizeButtonText}>Choose this date</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MemberRow({ member }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const responded = Boolean(member.respondedAt);
  let responseLabel = 'Waiting';
  if (responded && member.selectedCount === 0) responseLabel = 'None work';
  if (responded && member.selectedCount > 0) {
    responseLabel = `${member.selectedCount} option${member.selectedCount === 1 ? '' : 's'}`;
  }

  return (
    <View style={styles.memberRow}>
      <Avatar size={43} name={member.displayName} uri={member.avatarUri} />
      <View style={styles.memberCopy}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.isMe ? 'You' : member.displayName}
        </Text>
        {member.isHost ? <Text style={styles.hostLabel}>Poll host</Text> : null}
      </View>
      <View style={[styles.memberStatus, responded && styles.memberStatusResponded]}>
        <Text style={styles.memberStatusText}>{responseLabel}</Text>
      </View>
    </View>
  );
}

function AvailabilityPollDetailContent({ route, navigation }) {
  const { pollId, conversationId, circleName = 'Circle' } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [details, setDetails] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizingId, setFinalizingId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!pollId) return;
    if (!quiet) setLoading(true);
    setError('');

    try {
      const nextDetails = await getAvailabilityPollDetails(pollId);
      setDetails(nextDetails);
      setSelectedIds(
        nextDetails.options
          .filter((option) => option.selectedByViewer)
          .map((option) => option.id)
      );
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this availability poll.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pollId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const savedIds = useMemo(
    () => (details?.options || [])
      .filter((option) => option.selectedByViewer)
      .map((option) => option.id)
      .sort(),
    [details]
  );
  const currentIds = useMemo(() => [...selectedIds].sort(), [selectedIds]);
  const hasChanges = savedIds.join('|') !== currentIds.join('|')
    || (!details?.poll?.viewerResponded && Boolean(details));

  const toggleOption = (optionId) => {
    if (details?.poll?.status !== 'open' || saving || finalizingId) return;
    setSelectedIds((current) => (
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
    ));
  };

  const saveAvailability = async () => {
    if (saving || details?.poll?.status !== 'open') return;
    setSaving(true);

    try {
      const result = await respondToAvailabilityPoll(pollId, selectedIds);
      await load({ quiet: true });
      Alert.alert(
        'Availability saved',
        result.noneAvailable
          ? 'The Circle can see that none of these times work for you.'
          : `You marked ${result.selectedCount} option${result.selectedCount === 1 ? '' : 's'} as available.`
      );
    } catch (saveError) {
      Alert.alert(
        'Could not save availability',
        saveError?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const finalizeOption = (option) => {
    if (finalizingId || details?.poll?.status !== 'open') return;

    Alert.alert(
      'Finalize this date?',
      `${formatOptionDate(option.startsAt, option.endsAt)} will become the Circle’s event. Availability choices will not become RSVPs.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create Event',
          onPress: async () => {
            setFinalizingId(option.id);
            try {
              const eventId = await finalizeAvailabilityPoll(pollId, option.id);
              navigation.replace('EventDetail', { eventId, conversationId, circleName });
            } catch (finalizeError) {
              Alert.alert(
                'Could not finalize date',
                finalizeError?.message || 'Please try again.'
              );
              setFinalizingId('');
            }
          },
        },
      ]
    );
  };

  const poll = details?.poll;
  const counts = details?.counts;
  const options = details?.options || [];
  const members = details?.members || [];
  const isOpen = poll?.status === 'open';

  if (loading && !poll) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening availability poll…</Text>
      </SafeAreaView>
    );
  }

  if (error && !poll) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="options-outline" size={38} color={theme.colors.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
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
      >
        <View style={styles.heroCard}>
          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed" size={12} color={theme.colors.subtext} />
            <Text style={styles.privacyText}>{poll?.circleName}</Text>
            <View style={[styles.statusPill, !isOpen && styles.statusPillClosed]}>
              <Text style={styles.statusPillText}>{isOpen ? 'Open poll' : 'Finalized'}</Text>
            </View>
          </View>

          <Text style={styles.title}>{poll?.title}</Text>

          {poll?.locationName ? (
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={19} color={theme.colors.text} />
              <Text style={styles.detailText}>{poll.locationName}</Text>
            </View>
          ) : null}

          <View style={styles.hostRow}>
            <Avatar size={40} name={poll?.hostName} uri={poll?.hostAvatar} />
            <View style={styles.hostCopy}>
              <Text style={styles.hostName}>{poll?.hostName}</Text>
              <Text style={styles.hostBody}>Started this availability poll</Text>
            </View>
          </View>

          {poll?.description ? <Text style={styles.description}>{poll.description}</Text> : null}
        </View>

        <View style={styles.responseSummary}>
          <View>
            <Text style={styles.responseValue}>{counts?.responseCount || 0}/{counts?.memberCount || 0}</Text>
            <Text style={styles.responseLabel}>responded</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View>
            <Text style={styles.responseValue}>{counts?.waitingCount || 0}</Text>
            <Text style={styles.responseLabel}>waiting</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>{isOpen ? 'When are you available?' : 'Chosen date'}</Text>
            {isOpen ? (
              <Text style={styles.sectionBody}>Select every option that works for you.</Text>
            ) : (
              <Text style={styles.sectionBody}>This poll has become a private Circle event.</Text>
            )}
          </View>
        </View>

        {options.map((option) => (
          <PollOptionCard
            key={option.id}
            option={option}
            selected={selectedIds.includes(option.id) || option.isFinalized}
            disabled={!isOpen || saving || Boolean(finalizingId)}
            canManage={Boolean(poll?.canManage)}
            onToggle={() => toggleOption(option.id)}
            onFinalize={() => finalizeOption(option)}
          />
        ))}

        {isOpen ? (
          <Pressable
            onPress={saveAvailability}
            disabled={saving || !hasChanges || Boolean(finalizingId)}
            style={({ pressed }) => [
              styles.saveButton,
              (!hasChanges || saving || finalizingId) && styles.saveButtonDisabled,
              pressed && hasChanges && styles.pressed,
            ]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={19} color="#fff" />
                <Text style={styles.saveButtonText}>
                  {selectedIds.length === 0 ? 'None of These Work' : 'Save Availability'}
                </Text>
              </>
            )}
          </Pressable>
        ) : poll?.finalizedEventId ? (
          <Pressable
            onPress={() => navigation.navigate('EventDetail', { eventId: poll.finalizedEventId, conversationId, circleName })}
            style={({ pressed }) => [styles.openEventButton, pressed && styles.pressed]}
          >
            <Ionicons name="calendar" size={19} color="#fff" />
            <Text style={styles.openEventText}>Open Event</Text>
          </Pressable>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Circle responses</Text>
            <Text style={styles.sectionBody}>Availability is visible only inside this Circle.</Text>
          </View>
        </View>

        <View style={styles.membersCard}>
          {members.map((member, index) => (
            <View key={member.userId}>
              <MemberRow member={member} />
              {index < members.length - 1 ? <View style={styles.memberDivider} /> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AvailabilityPollDetailScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <AvailabilityPollDetailContent {...props} />
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
    padding: 16,
    paddingBottom: 50,
  },
  heroCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
  },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  privacyText: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
  statusPill: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.circle.accentSoft,
  },
  statusPillClosed: { backgroundColor: theme.circle.accentSoft },
  statusPillText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  title: {
    marginTop: 10,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 25,
    lineHeight: 31,
  },
  detailRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  detailText: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
  },
  hostRow: {
    marginTop: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hostCopy: { flex: 1 },
  hostName: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  hostBody: {
    marginTop: 1,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  description: {
    marginTop: 18,
    paddingTop: 17,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  responseSummary: {
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  responseValue: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
    textAlign: 'center',
  },
  responseLabel: {
    marginTop: 1,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    textAlign: 'center',
  },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: theme.colors.border },
  sectionHeader: { marginTop: 24, marginBottom: 10, paddingHorizontal: 2 },
  sectionTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  sectionBody: {
    marginTop: 2,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  optionCard: {
    marginBottom: 10,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  optionCardSelected: { borderWidth: 1.5, borderColor: theme.colors.text },
  optionCardFinalized: { backgroundColor: theme.circle.accentSoft },
  optionMain: {
    minHeight: 112,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#a8a8a8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  checkboxSelected: { borderColor: theme.welcome.brandInk, backgroundColor: theme.welcome.brandInk },
  checkboxDisabled: { opacity: 0.45 },
  optionCopy: { flex: 1 },
  optionDate: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    lineHeight: 20,
  },
  availabilityRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  availabilityCount: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  peopleNames: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  finalizedPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.welcome.brandInk,
  },
  finalizedPillText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
    textTransform: 'uppercase',
  },
  finalizeButton: {
    minHeight: 42,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  finalizeButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  saveButton: {
    minHeight: 50,
    marginTop: 3,
    borderRadius: 12,
    backgroundColor: theme.welcome.brandInk,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  saveButtonDisabled: { opacity: 0.38 },
  saveButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  openEventButton: {
    minHeight: 50,
    marginTop: 3,
    borderRadius: 12,
    backgroundColor: theme.welcome.brandInk,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  openEventText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  membersCard: {
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  memberRow: {
    minHeight: 66,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberCopy: { flex: 1 },
  memberName: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  hostLabel: {
    marginTop: 1,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  memberStatus: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.circle.accentSoft,
  },
  memberStatusResponded: { backgroundColor: '#e8e8e8' },
  memberStatusText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  memberDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 67,
    backgroundColor: theme.colors.border,
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
  pressed: { opacity: 0.7 },
  });
}
