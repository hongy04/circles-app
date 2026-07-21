import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Avatar } from '../../components/Avatar';
import { UnreadBadge } from '../../components/UnreadBadge';
import { COLORS } from '../../theme/colors';
import { timeAgo } from '../../utils/timeAgo';
import {
  listConversationInvitations,
  listMyConversations,
  respondToConversationInvitation,
  subscribeToConversationChanges,
  toggleConversationPin,
} from '../../services/conversationService';

function ConversationRow({ conversation, onOpen, onTogglePin }) {
  const subtitle = conversation.lastMessage
    || (conversation.kind === 'direct'
      ? 'You are connected. Start a private conversation.'
      : conversation.pendingInvitationCount > 0
        ? `Waiting on ${conversation.pendingInvitationCount} invitation${conversation.pendingInvitationCount === 1 ? '' : 's'}`
        : `${conversation.memberCount} members`);

  return (
    <Pressable
      onPress={() => onOpen(conversation)}
      onLongPress={() => onTogglePin(conversation)}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
      ]}
    >
      <Avatar
        size={54}
        name={conversation.title}
        uri={conversation.avatarUri}
        ripple={conversation.unreadCount > 0}
      />

      <View style={styles.rowCenter}>
        <View style={styles.titleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {conversation.title}
          </Text>
          {conversation.kind === 'group' ? (
            <Ionicons
              name="people-outline"
              size={15}
              color={COLORS.subtext}
              style={styles.kindIcon}
            />
          ) : null}
        </View>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.rowRight}>
        <View style={styles.timeLine}>
          {conversation.pinned ? (
            <Ionicons name="pin" size={13} color={COLORS.subtext} />
          ) : null}
          <Text style={styles.rowTime}>
            {timeAgo(conversation.lastMessageAt || conversation.createdAt)}
          </Text>
        </View>
        {conversation.unreadCount > 0 ? (
          <UnreadBadge count={conversation.unreadCount} />
        ) : (
          <Ionicons name="chevron-forward" size={17} color="#c7c7cc" />
        )}
      </View>
    </Pressable>
  );
}

function InvitationCard({ invitation, busy, onRespond }) {
  return (
    <View style={styles.invitationCard}>
      <View style={styles.invitationHeader}>
        <Avatar
          size={48}
          name={invitation.inviterName}
          uri={invitation.inviterAvatar}
        />
        <View style={styles.invitationText}>
          <Text style={styles.invitationTitle} numberOfLines={1}>
            {invitation.title}
          </Text>
          <Text style={styles.invitationSubtitle}>
            {invitation.inviterName} invited you to a private group with{' '}
            {invitation.memberCount} people.
          </Text>
        </View>
      </View>

      <View style={styles.invitationActions}>
        <Pressable
          onPress={() => onRespond(invitation, 'decline')}
          disabled={busy}
          style={({ pressed }) => [
            styles.secondaryButton,
            (pressed || busy) && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Decline</Text>
        </Pressable>
        <Pressable
          onPress={() => onRespond(invitation, 'accept')}
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || busy) && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Accept</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function InboxScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [respondingId, setRespondingId] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError(null);

    try {
      const [conversationRows, invitationRows] = await Promise.all([
        listMyConversations(),
        listConversationInvitations(),
      ]);
      setConversations(conversationRows);
      setInvitations(invitationRows);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load private conversations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('CreateGroup')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Create private group"
        >
          <Ionicons name="create-outline" size={24} color={COLORS.text} />
        </Pressable>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    return subscribeToConversationChanges({
      onConversationChange: () => load({ quiet: true }),
    });
  }, [load]);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aTime = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    }),
    [conversations]
  );

  const openConversation = async (conversation) => {
    await Haptics.selectionAsync();
    navigation.navigate('Chat', {
      conversationId: conversation.id,
      name: conversation.title,
      kind: conversation.kind,
    });
  };

  const togglePin = async (conversation) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const pinned = await toggleConversationPin(conversation.id);
      setConversations((current) => current.map((item) => (
        item.id === conversation.id ? { ...item, pinned } : item
      )));
    } catch (pinError) {
      Alert.alert('Could not update pin', pinError?.message || 'Please try again.');
    }
  };

  const respond = async (invitation, action) => {
    setRespondingId(invitation.id);
    try {
      const conversationId = await respondToConversationInvitation(
        invitation.id,
        action
      );
      await load({ quiet: true });

      if (action === 'accept') {
        navigation.navigate('Chat', {
          conversationId,
          name: invitation.title,
          kind: 'group',
        });
      }
    } catch (responseError) {
      Alert.alert(
        'Could not update invitation',
        responseError?.message || 'Please try again.'
      );
    } finally {
      setRespondingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Loading your circles…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load({ quiet: true });
          }}
        />
      )}
    >
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {invitations.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PRIVATE GROUP INVITATIONS</Text>
          {invitations.map((invitation) => (
            <InvitationCard
              key={invitation.id}
              invitation={invitation}
              busy={respondingId === invitation.id}
              onRespond={respond}
            />
          ))}
        </View>
      ) : null}

      {sortedConversations.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MESSAGES</Text>
          <View style={styles.listCard}>
            {sortedConversations.map((conversation, index) => (
              <View key={conversation.id}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <ConversationRow
                  conversation={conversation}
                  onOpen={openConversation}
                  onTogglePin={togglePin}
                />
              </View>
            ))}
          </View>
          <Text style={styles.pinHint}>Press and hold a conversation to pin it.</Text>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={34} color={COLORS.text} />
          </View>
          <Text style={styles.emptyTitle}>Your private conversations</Text>
          <Text style={styles.emptyBody}>
            Accepted connections appear here automatically. After you connect
            with at least two people, use the compose button to invite them into
            a private group.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 14,
    paddingBottom: 40,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    marginLeft: 4,
    marginBottom: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  listCard: {
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  rowCenter: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: {
    flexShrink: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  kindIcon: {
    marginLeft: 5,
  },
  rowSubtitle: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  rowRight: {
    minWidth: 48,
    alignItems: 'flex-end',
  },
  timeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  rowTime: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 78,
    backgroundColor: COLORS.border,
  },
  pinHint: {
    marginTop: 7,
    marginLeft: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  invitationCard: {
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  invitationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  invitationText: {
    flex: 1,
    marginLeft: 11,
  },
  invitationTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  invitationSubtitle: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  invitationActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 13,
  },
  primaryButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  emptyCard: {
    alignItems: 'center',
    marginTop: 40,
    paddingHorizontal: 28,
    paddingVertical: 34,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 33,
    backgroundColor: '#f1f1f1',
  },
  emptyTitle: {
    marginTop: 16,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  emptyBody: {
    marginTop: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  errorCard: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff1f0',
  },
  errorText: {
    color: '#b42318',
    fontFamily: 'Manrope_400Regular',
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 9,
  },
  retryText: {
    color: '#b42318',
    fontFamily: 'Manrope_700Bold',
  },
  pressed: {
    opacity: 0.7,
  },
});
