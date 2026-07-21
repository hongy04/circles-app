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
  useWindowDimensions,
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

function getConversationSubtitle(conversation) {
  return conversation.lastMessage
    || (conversation.kind === 'direct'
      ? 'You are connected. Start a private conversation.'
      : conversation.pendingInvitationCount > 0
        ? `Waiting on ${conversation.pendingInvitationCount} invitation${conversation.pendingInvitationCount === 1 ? '' : 's'}`
        : `${conversation.memberCount} members`);
}

function PinnedConversation({
  conversation,
  onOpen,
  onTogglePin,
  itemWidth,
}) {
  return (
    <View style={[styles.pinnedCell, { width: itemWidth }]}> 
      <Pressable
        onPress={() => onOpen(conversation)}
        onLongPress={() => onTogglePin(conversation)}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`Open ${conversation.title}`}
        accessibilityHint="Press and hold to unpin this conversation"
        style={({ pressed }) => [
          styles.pinnedPressable,
          pressed && styles.pinnedPressed,
        ]}
      >
        <View style={styles.pinnedAvatarWrap}>
          <Avatar
            size={74}
            name={conversation.title}
            uri={conversation.avatarUri}
            ripple={conversation.unreadCount > 0}
          />

          {conversation.kind === 'group' ? (
            <View style={styles.groupBadge}>
              <Ionicons name="people" size={13} color="#fff" />
            </View>
          ) : null}

          {conversation.unreadCount > 0 ? (
            <View style={styles.pinnedUnreadBadge}>
              <UnreadBadge count={conversation.unreadCount} />
            </View>
          ) : null}
        </View>

        <Text style={styles.pinnedLabel} numberOfLines={2}>
          {conversation.title}
        </Text>
      </Pressable>
    </View>
  );
}

function ConversationRow({ conversation, onOpen, onTogglePin }) {
  const subtitle = getConversationSubtitle(conversation);

  return (
    <Pressable
      onPress={() => onOpen(conversation)}
      onLongPress={() => onTogglePin(conversation)}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`Open ${conversation.title}`}
      accessibilityHint="Press and hold to pin this conversation"
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowAvatarWrap}>
        <Avatar
          size={56}
          name={conversation.title}
          uri={conversation.avatarUri}
          ripple={conversation.unreadCount > 0}
        />
        {conversation.kind === 'group' ? (
          <View style={styles.rowGroupBadge}>
            <Ionicons name="people" size={11} color="#fff" />
          </View>
        ) : null}
      </View>

      <View style={styles.rowCenter}>
        <View style={styles.titleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {conversation.title}
          </Text>
          <Text style={styles.rowTime}>
            {timeAgo(conversation.lastMessageAt || conversation.createdAt)}
          </Text>
        </View>

        <View style={styles.subtitleLine}>
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
          {conversation.unreadCount > 0 ? (
            <UnreadBadge count={conversation.unreadCount} />
          ) : (
            <Ionicons name="chevron-forward" size={17} color="#c7c7cc" />
          )}
        </View>
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
  const { width } = useWindowDimensions();
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
          style={({ pressed }) => pressed && styles.headerButtonPressed}
        >
          <Ionicons name="create-outline" size={25} color={COLORS.text} />
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

  const pinnedConversations = useMemo(
    () => sortedConversations.filter((conversation) => conversation.pinned),
    [sortedConversations]
  );

  const otherConversations = useMemo(
    () => sortedConversations.filter((conversation) => !conversation.pinned),
    [sortedConversations]
  );

  const pinnedColumnCount = width >= 700 ? 6 : width >= 520 ? 5 : 3;
  const contentWidth = Math.min(width, 760);
  const pinnedItemWidth = Math.floor((contentWidth - 24) / pinnedColumnCount);

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
        <View style={styles.invitationSection}>
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

      {pinnedConversations.length > 0 ? (
        <View style={styles.pinnedSection}>
          <Text style={styles.sectionLabel}>YOUR CIRCLES</Text>
          <View style={styles.pinnedGrid}>
            {pinnedConversations.map((conversation) => (
              <PinnedConversation
                key={conversation.id}
                conversation={conversation}
                onOpen={openConversation}
                onTogglePin={togglePin}
                itemWidth={pinnedItemWidth}
              />
            ))}
          </View>
        </View>
      ) : null}

      {otherConversations.length > 0 ? (
        <View style={styles.messageSection}>
          <Text style={styles.sectionLabel}>MESSAGES</Text>
          <View style={styles.messageList}>
            {otherConversations.map((conversation, index) => (
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
        </View>
      ) : null}

      {sortedConversations.length > 0 ? (
        <Text style={styles.pinHint}>
          Press and hold a conversation to pin or unpin it. New private groups
          begin in Your Circles automatically.
        </Text>
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
    backgroundColor: COLORS.bg,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingTop: 8,
    paddingBottom: 44,
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
  sectionLabel: {
    marginLeft: 16,
    marginBottom: 8,
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.7,
  },
  invitationSection: {
    marginTop: 8,
    marginBottom: 22,
  },
  invitationCard: {
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#f2f2f7',
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
    borderColor: '#d1d1d6',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  pinnedSection: {
    marginTop: 4,
    marginBottom: 18,
  },
  pinnedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 2,
  },
  pinnedCell: {
    minHeight: 118,
    alignItems: 'center',
    paddingHorizontal: 3,
    marginBottom: 8,
  },
  pinnedPressable: {
    width: '100%',
    alignItems: 'center',
  },
  pinnedPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  pinnedAvatarWrap: {
    position: 'relative',
    width: 82,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupBadge: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.bg,
    backgroundColor: COLORS.primary,
  },
  pinnedUnreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
  pinnedLabel: {
    maxWidth: 96,
    marginTop: 5,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  messageSection: {
    marginTop: 2,
  },
  messageList: {
    backgroundColor: COLORS.bg,
  },
  row: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 9,
    backgroundColor: COLORS.bg,
  },
  rowPressed: {
    backgroundColor: '#f2f2f7',
  },
  rowAvatarWrap: {
    position: 'relative',
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowGroupBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.bg,
    backgroundColor: COLORS.primary,
  },
  rowCenter: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  rowTime: {
    marginLeft: 8,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  subtitleLine: {
    minHeight: 23,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  rowSubtitle: {
    flex: 1,
    marginRight: 8,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 86,
    backgroundColor: COLORS.border,
  },
  pinHint: {
    marginTop: 13,
    marginHorizontal: 18,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    marginTop: 48,
    marginHorizontal: 24,
    paddingHorizontal: 24,
    paddingVertical: 34,
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
    marginHorizontal: 14,
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
  headerButtonPressed: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.7,
  },
});
