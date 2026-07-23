import React, { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
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
import { subscribeToConversationChanges } from '../../services/conversationService';
import {
  cancelCircleInvitation,
  getCirclePeople,
  leaveCircle,
  removeCircleMember,
  transferCircleOwnership,
  updateCircleMemberRole,
} from '../../services/circlePeopleService';

function roleLabel(role) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return '';
}

function formatInviteDate(value) {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return `Invited ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

function RolePill({ role }) {
  const label = roleLabel(role);
  if (!label) return null;

  return (
    <View style={[
      styles.rolePill,
      role === 'owner' && styles.ownerPill,
    ]}>
      <Text style={styles.rolePillText}>{label}</Text>
    </View>
  );
}

function EmptySection({ icon, title, body }) {
  return (
    <View style={styles.emptySection}>
      <Ionicons name={icon} size={31} color={COLORS.subtext} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function CirclePeopleScreen({ route, navigation }) {
  const { conversationId, circleName = 'Circle' } = route.params || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError('');

    try {
      setData(await getCirclePeople(conversationId));
    } catch (loadError) {
      setError(loadError?.message || 'Could not load this Circle’s people.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      return subscribeToConversationChanges({
        conversationId,
        onConversationChange: () => load({ quiet: true }),
      });
    }, [conversationId, load])
  );

  const viewer = useMemo(
    () => data?.members?.find((member) => member.isMe) || null,
    [data]
  );

  const run = async (key, task) => {
    setBusyKey(key);
    try {
      await task();
      await load({ quiet: true });
    } catch (actionError) {
      Alert.alert(
        'Could not update Circle',
        actionError?.message || 'Please try again.'
      );
    } finally {
      setBusyKey('');
    }
  };

  const confirmRemove = (member) => {
    Alert.alert(
      `Remove ${member.displayName}?`,
      'They will immediately lose access to the Circle, Chat, Posts, and Timeline. Their past contributions stay in the shared history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => run(`remove:${member.userId}`, () =>
            removeCircleMember(conversationId, member.userId)
          ),
        },
      ]
    );
  };

  const confirmTransfer = (member) => {
    Alert.alert(
      `Make ${member.displayName} the owner?`,
      'They will become the only owner. You will remain in the Circle as an admin.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          onPress: () => run(`transfer:${member.userId}`, () =>
            transferCircleOwnership(conversationId, member.userId)
          ),
        },
      ]
    );
  };

  const memberActions = (member) => {
    if (!data || member.isMe || member.role === 'owner') return [];

    const actions = [];
    if (data.viewerRole === 'owner') {
      actions.push({
        label: member.role === 'admin' ? 'Remove Admin Role' : 'Make Admin',
        onPress: () => run(`role:${member.userId}`, () =>
          updateCircleMemberRole(
            conversationId,
            member.userId,
            member.role === 'admin' ? 'member' : 'admin'
          )
        ),
      });
      actions.push({
        label: 'Transfer Ownership',
        onPress: () => confirmTransfer(member),
      });
      actions.push({
        label: 'Remove from Circle',
        destructive: true,
        onPress: () => confirmRemove(member),
      });
    } else if (data.viewerRole === 'admin' && member.role === 'member') {
      actions.push({
        label: 'Remove from Circle',
        destructive: true,
        onPress: () => confirmRemove(member),
      });
    }

    return actions;
  };

  const showMemberActions = (member) => {
    const actions = memberActions(member);
    if (!actions.length) return;

    if (Platform.OS === 'ios') {
      const labels = ['Cancel', ...actions.map((action) => action.label)];
      const destructiveIndex = actions.findIndex((action) => action.destructive);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex: 0,
          destructiveButtonIndex: destructiveIndex >= 0
            ? destructiveIndex + 1
            : undefined,
          title: member.displayName,
        },
        (buttonIndex) => {
          if (buttonIndex > 0) actions[buttonIndex - 1]?.onPress();
        }
      );
      return;
    }

    Alert.alert(
      member.displayName,
      undefined,
      [
        ...actions.map((action) => ({
          text: action.label,
          style: action.destructive ? 'destructive' : 'default',
          onPress: action.onPress,
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const cancelInvitation = (invitation) => {
    Alert.alert(
      `Cancel invitation to ${invitation.displayName}?`,
      'They will no longer be able to accept this invitation.',
      [
        { text: 'Keep Invitation', style: 'cancel' },
        {
          text: 'Cancel Invitation',
          style: 'destructive',
          onPress: () => run(`invite:${invitation.id}`, () =>
            cancelCircleInvitation(invitation.id)
          ),
        },
      ]
    );
  };

  const confirmLeave = () => {
    Alert.alert(
      `Leave ${data?.conversation?.title || circleName}?`,
      'You will immediately lose access. Messages and posts you already shared will stay as part of the Circle’s history.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave Circle',
          style: 'destructive',
          onPress: async () => {
            setBusyKey('leave');
            try {
              await leaveCircle(conversationId);
              navigation.popToTop();
            } catch (leaveError) {
              Alert.alert(
                'Could not leave Circle',
                leaveError?.message || 'Please try again.'
              );
              setBusyKey('');
            }
          },
        },
      ]
    );
  };

  if (loading && !data) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Loading people…</Text>
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

  const members = data?.members || [];
  const invitations = data?.pendingInvitations || [];
  const title = data?.conversation?.title || circleName;

  const header = (
    <>
      <View style={styles.circleSummary}>
        <Avatar
          size={72}
          name={title}
          uri={data?.conversation?.avatarUri}
        />
        <View style={styles.summaryText}>
          <Text style={styles.circleTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.privateLine}>
            <Ionicons name="lock-closed" size={12} color={COLORS.subtext} />
            <Text style={styles.privateText}>
              {members.length} member{members.length === 1 ? '' : 's'}
              {invitations.length
                ? ` · ${invitations.length} pending`
                : ''}
            </Text>
          </View>
        </View>
      </View>

      {data?.permissions?.canInvite ? (
        <Pressable
          onPress={() => navigation.navigate('InviteCirclePeople', {
            conversationId,
            circleName: title,
          })}
          style={({ pressed }) => [
            styles.inviteButton,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.inviteIcon}>
            <Ionicons name="person-add" size={18} color="#fff" />
          </View>
          <View style={styles.inviteCopy}>
            <Text style={styles.inviteTitle}>Invite people</Text>
            <Text style={styles.inviteBody}>
              Add accepted connections through a private invitation.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
        </Pressable>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>MEMBERS</Text>
        <Text style={styles.sectionCount}>{members.length}</Text>
      </View>
    </>
  );

  const footer = (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>PENDING INVITATIONS</Text>
        <Text style={styles.sectionCount}>{invitations.length}</Text>
      </View>

      {invitations.length ? (
        <View style={styles.card}>
          {invitations.map((invitation, index) => (
            <View key={invitation.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <View style={styles.personRow}>
                <Avatar
                  size={48}
                  name={invitation.displayName}
                  uri={invitation.avatarUri}
                />
                <View style={styles.personCopy}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {invitation.displayName}
                  </Text>
                  <Text style={styles.personSubtitle} numberOfLines={2}>
                    {formatInviteDate(invitation.createdAt)} by{' '}
                    {invitation.invitedByName}
                  </Text>
                </View>
                {data?.permissions?.canCancelInvitations ? (
                  <Pressable
                    onPress={() => cancelInvitation(invitation)}
                    disabled={busyKey === `invite:${invitation.id}`}
                    style={({ pressed }) => [
                      styles.cancelInviteButton,
                      (pressed || busyKey === `invite:${invitation.id}`)
                        && styles.pressed,
                    ]}
                  >
                    {busyKey === `invite:${invitation.id}` ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <Text style={styles.cancelInviteText}>Cancel</Text>
                    )}
                  </Pressable>
                ) : (
                  <View style={styles.pendingPill}>
                    <Text style={styles.pendingText}>Pending</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <EmptySection
          icon="mail-open-outline"
          title="No pending invitations"
          body="Everyone invited to this Circle has responded."
        />
      )}

      <View style={styles.historyCard}>
        <Ionicons name="time-outline" size={21} color={COLORS.text} />
        <Text style={styles.historyText}>
          Leaving or removing someone ends their access immediately, but it
          does not rewrite the Circle’s shared history. Past messages, posts,
          and comments remain attributed to the person who shared them.
        </Text>
      </View>

      {viewer?.role === 'owner' ? (
        <View style={styles.ownerNotice}>
          <Text style={styles.ownerNoticeTitle}>You own this Circle</Text>
          <Text style={styles.ownerNoticeBody}>
            Transfer ownership to another member before you can leave.
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={confirmLeave}
          disabled={busyKey === 'leave'}
          style={({ pressed }) => [
            styles.leaveButton,
            (pressed || busyKey === 'leave') && styles.pressed,
          ]}
        >
          {busyKey === 'leave' ? (
            <ActivityIndicator color="#c62828" />
          ) : (
            <Text style={styles.leaveText}>Leave Circle</Text>
          )}
        </Pressable>
      )}
    </>
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={members}
        keyExtractor={(member) => member.userId}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
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
        renderItem={({ item, index }) => {
          const actions = memberActions(item);
          const itemBusy = busyKey.endsWith(item.userId);
          return (
            <View style={[
              styles.cardRowWrap,
              index === 0 && styles.firstMemberRow,
              index === members.length - 1 && styles.lastMemberRow,
            ]}>
              {index === 0 ? null : <View style={styles.separator} />}
              <View style={styles.personRow}>
                <Pressable
                  onPress={() => navigation.navigate('Profile', {
                    userId: item.userId,
                  })}
                  style={({ pressed }) => [
                    styles.personMain,
                    pressed && styles.pressed,
                  ]}
                >
                  <Avatar
                    size={50}
                    name={item.displayName}
                    uri={item.avatarUri}
                  />
                  <View style={styles.personCopy}>
                    <View style={styles.nameLine}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {item.isMe ? 'You' : item.displayName}
                      </Text>
                      <RolePill role={item.role} />
                    </View>
                    <Text style={styles.personSubtitle} numberOfLines={1}>
                      {item.role === 'owner'
                        ? 'Controls ownership and member roles'
                        : item.role === 'admin'
                          ? 'Can invite and manage members'
                          : 'Circle member'}
                    </Text>
                  </View>
                </Pressable>

                {itemBusy ? (
                  <ActivityIndicator size="small" />
                ) : actions.length ? (
                  <Pressable
                    onPress={() => showMemberActions(item)}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.moreButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={21}
                      color={COLORS.text}
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingBottom: 44,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: COLORS.bg,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
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
  retryText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  circleSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
  },
  summaryText: {
    flex: 1,
    marginLeft: 14,
  },
  circleTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 21,
  },
  privateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  privateText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  inviteIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: COLORS.primary,
  },
  inviteCopy: {
    flex: 1,
    marginHorizontal: 11,
  },
  inviteTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  inviteBody: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  sectionCount: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  card: {
    overflow: 'hidden',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  cardRowWrap: {
    overflow: 'hidden',
    marginHorizontal: 0,
    backgroundColor: COLORS.bg,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  firstMemberRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  lastMemberRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
  },
  personRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  personMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  personCopy: {
    flex: 1,
    marginLeft: 12,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  personName: {
    flexShrink: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  personSubtitle: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 15,
  },
  rolePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ececec',
  },
  ownerPill: {
    backgroundColor: '#dedede',
  },
  rolePillText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
  },
  moreButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 74,
    backgroundColor: COLORS.border,
  },
  cancelInviteButton: {
    minWidth: 65,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f4f4f4',
  },
  cancelInviteText: {
    color: '#b3261e',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
  pendingPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: '#eeeeee',
  },
  pendingText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  emptySection: {
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingVertical: 25,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  emptyTitle: {
    marginTop: 9,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  emptyBody: {
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 22,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#eeeeee',
  },
  historyText: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 17,
  },
  ownerNotice: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  ownerNoticeTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  ownerNoticeBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  leaveButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d9a4a0',
    backgroundColor: COLORS.bg,
  },
  leaveText: {
    color: '#c62828',
    fontFamily: 'Manrope_700Bold',
  },
  pressed: {
    opacity: 0.67,
  },
});
