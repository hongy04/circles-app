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
import { EventRepeatCard } from '../../components/events/EventRepeatCard';
import { COLORS } from '../../theme/colors';
import {
  getEventRepeatSummary,
  listEventConnectionCandidates,
  sendEventConnectionRequest,
  setEventRepeatSignal,
} from '../../services/eventService';

function sharedEventLabel(count) {
  const safeCount = Number(count || 0);
  if (safeCount <= 1) return 'Met at this event';
  return `${safeCount} shared events`;
}

function actionCopy(status, viewerAttended) {
  if (!viewerAttended || status === 'unavailable') {
    return { label: 'Attended', disabled: true, kind: 'quiet' };
  }
  if (status === 'connected') {
    return { label: 'Connected', disabled: true, kind: 'quiet' };
  }
  if (status === 'outgoing') {
    return { label: 'Requested', disabled: true, kind: 'quiet' };
  }
  if (status === 'incoming') {
    return { label: 'Review', disabled: false, kind: 'secondary' };
  }
  return { label: 'Connect', disabled: false, kind: 'primary' };
}

function CandidateRow({
  candidate,
  viewerAttended,
  busy,
  onOpen,
  onConnect,
}) {
  const action = actionCopy(candidate.relationshipStatus, viewerAttended);
  const canOpen = Boolean(candidate.canOpenProfile);

  const handleAction = () => {
    if (candidate.relationshipStatus === 'incoming') {
      onOpen(candidate);
      return;
    }
    if (candidate.relationshipStatus === 'available') {
      onConnect(candidate);
    }
  };

  return (
    <View style={styles.personCard}>
      <Pressable
        onPress={() => canOpen && onOpen(candidate)}
        disabled={!canOpen}
        style={({ pressed }) => [
          styles.personIdentity,
          pressed && canOpen && styles.pressed,
        ]}
      >
        <Avatar
          size={52}
          name={candidate.displayName}
          uri={candidate.avatarUri}
        />
        <View style={styles.personCopy}>
          <View style={styles.nameRow}>
            <Text style={styles.personName} numberOfLines={1}>
              {candidate.displayName}
            </Text>
            {candidate.isHost ? (
              <View style={styles.hostBadge}>
                <Text style={styles.hostBadgeText}>Host</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.contextText} numberOfLines={1}>
            {sharedEventLabel(candidate.sharedEventCount)}
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={handleAction}
        disabled={action.disabled || busy}
        style={({ pressed }) => [
          styles.actionButton,
          action.kind === 'primary' && styles.actionButtonPrimary,
          action.kind === 'secondary' && styles.actionButtonSecondary,
          action.kind === 'quiet' && styles.actionButtonQuiet,
          (pressed || busy) && !action.disabled && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator
            size="small"
            color={action.kind === 'primary' ? '#fff' : COLORS.text}
          />
        ) : (
          <Text style={[
            styles.actionText,
            action.kind === 'primary' && styles.actionTextPrimary,
          ]}>
            {action.label}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

export function EventConnectionsScreen({ navigation, route }) {
  const eventId = route?.params?.eventId;
  const fallbackTitle = route?.params?.eventTitle || 'this event';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingUserId, setSendingUserId] = useState('');
  const [repeatSummary, setRepeatSummary] = useState(null);
  const [updatingRepeatSignal, setUpdatingRepeatSignal] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!eventId) return;
    if (!quiet) setLoading(true);
    setError('');

    try {
      const nextData = await listEventConnectionCandidates(eventId);
      setData(nextData);

      try {
        setRepeatSummary(await getEventRepeatSummary(eventId));
      } catch {
        setRepeatSummary(null);
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not load people from this event.');
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

  const openProfile = (candidate) => {
    if (!candidate?.userId || !candidate.canOpenProfile) return;
    navigation.navigate('Profile', {
      userId: candidate.userId,
      sourceEventId: eventId,
    });
  };

  const updateRepeatSignal = async (interested) => {
    if (updatingRepeatSignal) return;
    setUpdatingRepeatSignal(true);

    try {
      await setEventRepeatSignal(eventId, interested);
      setRepeatSummary(await getEventRepeatSummary(eventId));
    } catch (repeatError) {
      Alert.alert(
        'Could not update repeat signal',
        repeatError?.message || 'Please try again.'
      );
    } finally {
      setUpdatingRepeatSignal(false);
    }
  };

  const connect = async (candidate) => {
    if (!candidate?.userId || sendingUserId) return;
    setSendingUserId(candidate.userId);

    try {
      await sendEventConnectionRequest(eventId, candidate.userId);
      await load({ quiet: true });
    } catch (requestError) {
      Alert.alert(
        'Could not send request',
        requestError?.message || 'Please try again.'
      );
    } finally {
      setSendingUserId('');
    }
  };

  if (loading && !data) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening event connections…</Text>
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="people-outline" size={38} color={COLORS.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const title = data?.eventTitle || fallbackTitle;
  const candidates = data?.candidates || [];
  const viewerAttended = Boolean(data?.viewerAttended);

  const header = (
    <View>
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="people-outline" size={25} color={COLORS.text} />
        </View>
        <Text style={styles.eyebrow}>SHARED EVENT</Text>
        <Text style={styles.title}>People from {title}</Text>
        <Text style={styles.body}>
          Attendance creates context, not access. Profiles remain private and every connection still requires a request and acceptance.
        </Text>
      </View>

      {!viewerAttended ? (
        <View style={styles.noticeCard}>
          <Ionicons name="shield-outline" size={22} color={COLORS.text} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>Historical view only</Text>
            <Text style={styles.noticeBody}>
              You were not marked as attended, so this event cannot be used to open new profiles or send connection requests.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.noticeCard}>
          <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.text} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>You were both there</Text>
            <Text style={styles.noticeBody}>
              You may view each confirmed attendee’s limited profile shell and choose whether to connect.
            </Text>
          </View>
        </View>
      )}

      {repeatSummary?.available ? (
        <EventRepeatCard
          summary={repeatSummary}
          updating={updatingRepeatSignal}
          onToggle={updateRepeatSignal}
        />
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Confirmed attendees</Text>
        <Text style={styles.sectionCount}>{candidates.length}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={candidates}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <CandidateRow
            candidate={item}
            viewerAttended={viewerAttended}
            busy={sendingUserId === item.userId}
            onOpen={openProfile}
            onConnect={connect}
          />
        )}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <Ionicons name="person-outline" size={30} color={COLORS.subtext} />
            <Text style={styles.emptyTitle}>No other app attendees</Text>
            <Text style={styles.emptyBody}>
              Outside guests remain in the event history. They appear here only after joining Circles and claiming reviewed attendance.
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
    padding: 16,
    paddingBottom: 44,
  },
  heroCard: {
    padding: 19,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  eyebrow: {
    marginTop: 16,
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 5,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 23,
    lineHeight: 29,
  },
  body: {
    marginTop: 8,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 20,
  },
  noticeCard: {
    marginTop: 12,
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    gap: 11,
  },
  noticeCopy: { flex: 1 },
  noticeTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  noticeBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 17,
  },
  sectionHeader: {
    marginTop: 22,
    marginBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  sectionCount: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  personCard: {
    minHeight: 76,
    marginBottom: 8,
    padding: 11,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  personIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  personCopy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  personName: {
    flexShrink: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  hostBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#eeeeee',
  },
  hostBadgeText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
  },
  contextText: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  actionButton: {
    minWidth: 82,
    minHeight: 38,
    paddingHorizontal: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimary: { backgroundColor: COLORS.primary },
  actionButtonSecondary: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  actionButtonQuiet: { backgroundColor: '#f1f1f1' },
  actionText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  actionTextPrimary: { color: '#fff' },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 10,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  emptyBody: {
    marginTop: 5,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f7f7f7',
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
  },
  errorText: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.68 },
});
