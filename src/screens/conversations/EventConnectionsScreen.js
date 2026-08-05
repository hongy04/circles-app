import React, { useCallback, useMemo, useState } from 'react';
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
import { ContinuityLoadingCard } from '../../components/ContinuityLoadingCard';

import { Avatar } from '../../components/Avatar';
import { EventRepeatCard } from '../../components/events/EventRepeatCard';
import { EventRoomSectionHero } from '../../components/events/EventRoomSectionHero';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  getEventRepeatSummary,
  listEventConnectionCandidates,
  sendEventConnectionRequest,
  setEventRepeatSignal,
} from '../../services/eventService';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(255,255,255,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  styles,
  theme,
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
            color={action.kind === 'primary' ? '#fff' : theme.colors.text}
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

function EventConnectionsContent({ navigation, route }) {
  const eventId = route?.params?.eventId;
  const appearanceKey = route?.params?.appearanceKey || 'circle';
  const coverUri = route?.params?.coverUri || null;
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
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

  if (!data) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <View style={styles.shellContent}>
          <EventRoomSectionHero
            appearanceKey={appearanceKey}
            coverUri={coverUri}
            eventTitle={fallbackTitle}
            eyebrow="SHARED ATTENDANCE"
            title="People from this event"
            body="Reconnect with people you actually shared the gathering with."
            icon="people-outline"
          />
          <ContinuityLoadingCard
            label="Loading confirmed attendees…"
            body="This event connection space is already visible while eligibility loads."
            icon="people-outline"
            error={error}
            onRetry={error ? () => load() : undefined}
          />
        </View>
      </SafeAreaView>
    );
  }

  const title = data?.eventTitle || fallbackTitle;
  const candidates = data?.candidates || [];
  const viewerAttended = Boolean(data?.viewerAttended);

  const header = (
    <View>
      <EventRoomSectionHero
        appearanceKey={appearanceKey}
        coverUri={coverUri}
        eventTitle={title}
        eyebrow="SHARED ATTENDANCE"
        title={viewerAttended ? 'People you were there with' : 'Event history'}
        body={viewerAttended
          ? 'Shared attendance gives a little context. Connecting still takes a request and acceptance.'
          : 'You were not marked as attended, so this remains a private historical view.'}
        icon={viewerAttended ? 'checkmark-circle-outline' : 'shield-outline'}
        trailingLabel={viewerAttended ? 'Confirmed' : 'View only'}
      />

      <View style={styles.contextCard}>
        <View style={styles.contextIcon}>
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.text} />
        </View>
        <View style={styles.contextCopy}>
          <Text style={styles.contextTitle}>Context, not automatic access</Text>
          <Text style={styles.contextBody}>Profiles stay private until normal connection rules allow them to open.</Text>
        </View>
      </View>

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
            styles={styles}
            theme={theme}
          />
        )}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <Ionicons name="person-outline" size={30} color={theme.colors.subtext} />
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
            tintColor={theme.colors.text}
          />
        )}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

export function EventConnectionsScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <EventConnectionsContent {...props} />
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
    paddingBottom: 44,
  },
  contextCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: rgba(theme.colors.surface, 0.82),
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  contextIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  contextCopy: { flex: 1 },
  contextEyebrow: {
    color: theme.circle.accent,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  contextTitle: {
    marginTop: 3,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  contextBody: {
    marginTop: 3,
    color: theme.colors.subtext,
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
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  sectionCount: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  personCard: {
    minHeight: 76,
    marginBottom: 8,
    padding: 11,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  hostBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.circle.accentSoft,
  },
  hostBadgeText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
  },
  contextText: {
    marginTop: 3,
    color: theme.colors.subtext,
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
  actionButtonPrimary: { backgroundColor: theme.welcome.brandInk },
  actionButtonSecondary: {
    borderWidth: 1,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
  },
  actionButtonQuiet: { backgroundColor: theme.circle.accentSoft },
  actionText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  actionTextPrimary: { color: '#fff' },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 10,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  emptyBody: {
    marginTop: 5,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  shellContent: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: theme.circle.profileBackground,
  },
  stateText: {
    marginTop: 10,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
  },
  errorText: {
    marginTop: 12,
    color: theme.colors.text,
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
    backgroundColor: theme.welcome.brandInk,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.68 },
  });
}
