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

import { Avatar } from '../../components/Avatar';
import { EventRepeatCard } from '../../components/events/EventRepeatCard';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
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
        <Ionicons name="people-outline" size={38} color={theme.colors.text} />
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
      <View style={styles.contextCard}>
        <View style={styles.contextIcon}>
          <Ionicons
            name={viewerAttended ? 'checkmark-circle-outline' : 'shield-outline'}
            size={22}
            color={theme.colors.text}
          />
        </View>
        <View style={styles.contextCopy}>
          <Text style={styles.contextEyebrow} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.contextTitle}>
            {viewerAttended ? 'You were both there' : 'Historical view only'}
          </Text>
          <Text style={styles.contextBody}>
            {viewerAttended
              ? 'Shared attendance gives limited profile context. Every connection still requires a request and acceptance.'
              : 'You were not marked as attended, so this event cannot be used to open profiles or send connection requests.'}
          </Text>
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
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
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
