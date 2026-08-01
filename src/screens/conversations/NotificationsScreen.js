import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useThemeTokens } from '../../theme/ThemeProvider';
import { timeAgo } from '../../utils/timeAgo';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotificationChanges,
} from '../../services/notificationService';

function notificationCopy(notification) {
  switch (notification.type) {
    case 'personal_like':
      return {
        icon: 'heart-outline',
        text: `${notification.actorName} liked your post.`,
      };
    case 'personal_comment':
      return {
        icon: 'chatbubble-outline',
        text: `${notification.actorName} commented on your post.`,
      };
    case 'circle_post':
      return {
        icon: 'albums-outline',
        text: `${notification.actorName} shared a new post in ${notification.conversationTitle || 'your Circle'}.`,
      };
    case 'circle_comment':
      return {
        icon: 'chatbubble-outline',
        text: `${notification.actorName} commented on your post in ${notification.conversationTitle || 'your Circle'}.`,
      };
    case 'circle_like':
      return {
        icon: 'heart-outline',
        text: `${notification.actorName} liked your post in ${notification.conversationTitle || 'your Circle'}.`,
      };
    case 'conversation_invitation':
      return {
        icon: 'person-add-outline',
        text: `${notification.actorName} invited you to ${notification.conversationTitle || 'a private Circle'}.`,
      };
    case 'safety_report_resolved':
      return {
        icon: 'shield-checkmark-outline',
        text: 'Circles completed an update on a safety report you submitted.',
      };
    case 'safety_appeal_resolved':
      return {
        icon: 'document-text-outline',
        text: 'Circles completed the review of your account-action appeal.',
      };
    case 'safety_age_correction_resolved':
      return {
        icon: 'calendar-outline',
        text: 'Circles completed the review of your birth-date correction request.',
      };
    default:
      return {
        icon: 'notifications-outline',
        text: 'You have new private activity.',
      };
  }
}

function isSafetyNotification(type) {
  return type === 'safety_report_resolved'
    || type === 'safety_appeal_resolved'
    || type === 'safety_age_correction_resolved';
}

function NotificationRow({ notification, onOpen, styles, theme }) {
  const copy = notificationCopy(notification);
  const isSafety = isSafetyNotification(notification.type);

  return (
    <Pressable
      onPress={() => onOpen(notification)}
      style={({ pressed }) => [
        styles.row,
        !notification.isRead && styles.unreadRow,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.avatarWrap}>
        {isSafety ? (
          <View style={styles.systemAvatar}>
            <Ionicons name="shield-checkmark" size={23} color={theme.colors.text} />
          </View>
        ) : (
          <Avatar
            size={48}
            name={notification.actorName}
            uri={notification.actorAvatar}
          />
        )}
        <View style={[styles.typeBadge, { backgroundColor: isSafety ? theme.colors.text : theme.circle.accent, borderColor: theme.colors.bg }]}>
          <Ionicons name={copy.icon} size={13} color="#fff" />
        </View>
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.message}>{copy.text}</Text>
        <Text style={styles.time}>{timeAgo(notification.createdAt)}</Text>
      </View>

      {!notification.isRead ? <View style={styles.unreadDot} /> : null}
      <Ionicons name="chevron-forward" size={17} color="#c7c7cc" />
    </Pressable>
  );
}

export function NotificationsScreen({ navigation }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(false);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications]
  );

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');

    try {
      setNotifications(await listNotifications());
    } catch (loadError) {
      setError(loadError?.message || 'Could not load notifications.');
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load({ quiet: hasLoadedRef.current });
      return subscribeToNotificationChanges(() => load({ quiet: true }));
    }, [load])
  );

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => unreadCount > 0 ? (
        <Pressable
          onPress={async () => {
            try {
              await markAllNotificationsRead();
              setNotifications((current) => current.map((item) => ({
                ...item,
                isRead: true,
                readAt: item.readAt || new Date().toISOString(),
              })));
            } catch (markError) {
              Alert.alert(
                'Could not mark notifications read',
                markError?.message || 'Please try again.'
              );
            }
          }}
          hitSlop={10}
        >
          <Text style={styles.markAllText}>Mark all read</Text>
        </Pressable>
      ) : null,
    });
  }, [navigation, unreadCount]);

  const markReadLocally = (notification) => {
    if (notification.isRead) return;

    setNotifications((current) => current.map((item) => (
      item.id === notification.id
        ? { ...item, isRead: true, readAt: new Date().toISOString() }
        : item
    )));
    markNotificationRead(notification.id).catch(() => {});
  };

  const openNotification = (notification) => {
    markReadLocally(notification);

    if (isSafetyNotification(notification.type)) {
      const rootNavigation = navigation.getParent()?.getParent() || navigation;
      if (notification.type === 'safety_report_resolved') {
        rootNavigation.navigate('MySafetyReports');
      } else if (notification.type === 'safety_appeal_resolved') {
        rootNavigation.navigate('AccountAppeal');
      } else {
        rootNavigation.navigate('AgeCorrectionRequest');
      }
      return;
    }

    if (notification.type === 'conversation_invitation') {
      navigation.navigate('Inbox');
      return;
    }

    if (notification.personalPostId) {
      // PostDetail belongs to the root stack. Explicitly reach the root so the
      // same activity screen can open personal posts from the Circles stack.
      const rootNavigation = navigation.getParent()?.getParent();
      const targetNavigation = rootNavigation || navigation;
      targetNavigation.navigate('PostDetail', {
        postId: notification.personalPostId,
        openComments: notification.type === 'personal_comment',
        source: 'notification',
      });
      return;
    }

    if (notification.circlePostId && notification.conversationId) {
      navigation.navigate('CirclePostDetail', {
        postId: notification.circlePostId,
        conversationId: notification.conversationId,
      });
      return;
    }

    if (notification.conversationId) {
      navigation.navigate('CircleProfile', {
        conversationId: notification.conversationId,
      });
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Loading activity…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow notification={item} onOpen={openNotification} styles={styles} theme={theme} />
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
        ListHeaderComponent={error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Ionicons
              name="notifications-outline"
              size={42}
              color={theme.colors.subtext}
            />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyBody}>
              Likes, comments, private Circle activity, invitations, and private
              safety outcomes will all appear here.
            </Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  listContent: { flexGrow: 1, paddingBottom: 36 },
  row: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  unreadRow: { backgroundColor: theme.colors.surfaceSoft },
  avatarWrap: { width: 54, height: 54, justifyContent: 'center' },
  systemAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  typeBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  rowBody: { flex: 1, marginHorizontal: 11 },
  message: {
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  time: {
    marginTop: 4,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
  },
  unreadDot: {
    width: 8,
    height: 8,
    marginRight: 8,
    borderRadius: 4,
    backgroundColor: theme.circle.accent,
  },
  markAllText: {
    color: theme.circle.accent,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceSoft,
  },
  errorText: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  retryText: {
    color: theme.circle.accent,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyTitle: {
    marginTop: 13,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  emptyBody: {
    maxWidth: 430,
    marginTop: 7,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  stateText: {
    marginTop: 10,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  pressed: { opacity: 0.7 },
  });
}
