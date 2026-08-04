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
import { ThemeAtmosphere } from '../../components/ThemeAtmosphere';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { timeAgo } from '../../utils/timeAgo';
function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(77,185,229,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotificationChanges,
} from '../../services/notificationService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';
import { reconcileRowsById } from '../../utils/reconcileRows';

const NOTIFICATION_PAGE_SIZE = 40;
const NOTIFICATION_FOCUS_FRESH_MS = 15_000;
const NOTIFICATION_REALTIME_DEBOUNCE_MS = 240;

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

function sameNotification(left, right) {
  return left?.id === right?.id
    && left?.type === right?.type
    && left?.conversationId === right?.conversationId
    && left?.conversationTitle === right?.conversationTitle
    && left?.actorId === right?.actorId
    && left?.actorName === right?.actorName
    && left?.actorAvatar === right?.actorAvatar
    && left?.circlePostId === right?.circlePostId
    && left?.circleCommentId === right?.circleCommentId
    && left?.personalPostId === right?.personalPostId
    && left?.personalCommentId === right?.personalCommentId
    && left?.invitationId === right?.invitationId
    && left?.safetyReportId === right?.safetyReportId
    && left?.accountAppealId === right?.accountAppealId
    && left?.ageCorrectionRequestId === right?.ageCorrectionRequestId
    && left?.createdAt === right?.createdAt
    && left?.readAt === right?.readAt
    && left?.isRead === right?.isRead;
}

const NotificationRow = React.memo(function NotificationRow({ notification, onOpen, styles, theme }) {
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
});

export function NotificationsScreen({ navigation }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cachedNotifications = readNavigationCache(navigationCacheKeys.notifications());
  const cachedRows = Array.isArray(cachedNotifications)
    ? cachedNotifications
    : cachedNotifications?.items || [];
  const [notifications, setNotifications] = useState(cachedRows);
  const notificationsRef = useRef(cachedRows);
  const [loading, setLoading] = useState(!cachedNotifications);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(
    cachedNotifications?.hasMore ?? cachedRows.length >= NOTIFICATION_PAGE_SIZE
  );
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(Boolean(cachedNotifications));
  const lastRefreshAtRef = useRef(Number(cachedNotifications?.refreshedAt || 0));
  const loadInFlightRef = useRef(null);
  const realtimeTimerRef = useRef(null);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications]
  );

  const persistNotifications = useCallback((items, nextHasMore) => {
    writeNavigationCache(navigationCacheKeys.notifications(), {
      items,
      hasMore: nextHasMore,
      refreshedAt: lastRefreshAtRef.current,
    });
  }, []);

  const load = useCallback(async ({
    quiet = false,
    force = false,
  } = {}) => {
    if (loadInFlightRef.current) return loadInFlightRef.current;
    if (!quiet) setLoading(true);
    setError('');

    const request = (async () => {
      try {
        const nextNotifications = await listNotifications({
          limit: NOTIFICATION_PAGE_SIZE,
          before: new Date().toISOString(),
        });
        const nextHasMore = nextNotifications.length === NOTIFICATION_PAGE_SIZE;
        const reconciled = reconcileRowsById(
          notificationsRef.current,
          nextNotifications,
          sameNotification
        );
        notificationsRef.current = reconciled;
        setNotifications(reconciled);
        setHasMore(nextHasMore);
        lastRefreshAtRef.current = Date.now();
        persistNotifications(reconciled, nextHasMore);
      } catch (loadError) {
        setError(loadError?.message || 'Could not load notifications.');
      } finally {
        hasLoadedRef.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    })();

    loadInFlightRef.current = request.finally(() => {
      loadInFlightRef.current = null;
    });
    return loadInFlightRef.current;
  }, [persistNotifications]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || notifications.length === 0) return;
    const cursor = notifications[notifications.length - 1]?.createdAt;
    if (!cursor) return;

    setLoadingMore(true);
    try {
      const nextPage = await listNotifications({
        limit: NOTIFICATION_PAGE_SIZE,
        before: cursor,
      });
      const seen = new Set(notifications.map((item) => item.id));
      const uniqueRows = nextPage.filter((item) => !seen.has(item.id));
      const merged = [...notifications, ...uniqueRows];
      const nextHasMore = nextPage.length === NOTIFICATION_PAGE_SIZE;
      setNotifications(merged);
      setHasMore(nextHasMore);
      persistNotifications(merged, nextHasMore);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load more notifications.');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, notifications, persistNotifications]);

  const scheduleRealtimeLoad = useCallback(() => {
    if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = setTimeout(() => {
      realtimeTimerRef.current = null;
      void load({ quiet: true, force: true });
    }, NOTIFICATION_REALTIME_DEBOUNCE_MS);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      const isFresh = hasLoadedRef.current
        && Date.now() - lastRefreshAtRef.current < NOTIFICATION_FOCUS_FRESH_MS;
      if (!isFresh) {
        void load({ quiet: hasLoadedRef.current });
      }
      return undefined;
    }, [load])
  );

  useEffect(() => {
    const unsubscribe = subscribeToNotificationChanges(scheduleRealtimeLoad);
    return () => {
      unsubscribe();
      if (realtimeTimerRef.current) {
        clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }
    };
  }, [scheduleRealtimeLoad]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => unreadCount > 0 ? (
        <Pressable
          onPress={async () => {
            try {
              await markAllNotificationsRead();
              setNotifications((current) => {
                const next = current.map((item) => ({
                  ...item,
                  isRead: true,
                  readAt: item.readAt || new Date().toISOString(),
                }));
                notificationsRef.current = next;
                persistNotifications(next, hasMore);
                return next;
              });
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
  }, [hasMore, navigation, persistNotifications, unreadCount]);

  const markReadLocally = useCallback((notification) => {
    if (notification.isRead) return;

    setNotifications((current) => {
      const next = current.map((item) => (
        item.id === notification.id
          ? { ...item, isRead: true, readAt: new Date().toISOString() }
          : item
      ));
      notificationsRef.current = next;
      persistNotifications(next, hasMore);
      return next;
    });
    markNotificationRead(notification.id).catch(() => {});
  }, [hasMore, persistNotifications]);

  const openNotification = useCallback((notification) => {
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
    }, [markReadLocally, navigation]);

  const renderNotification = useCallback(({ item }) => (
    <NotificationRow
      notification={item}
      onOpen={openNotification}
      styles={styles}
      theme={theme}
    />
  ), [openNotification, styles, theme]);

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ThemeAtmosphere theme={theme} strength={0.82} decals />
        <View style={styles.stateCard}>
          <ActivityIndicator color={theme.circle.accent} />
          <Text style={styles.stateText}>Loading activity…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ThemeAtmosphere theme={theme} strength={0.88} decals />
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        onEndReachedThreshold={0.35}
        onEndReached={loadMore}
        renderItem={renderNotification}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load({ quiet: true });
            }}
            tintColor={theme.circle.accent}
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
        ListFooterComponent={loadingMore ? (
          <View style={{ paddingVertical: 18 }}>
            <ActivityIndicator color={theme.circle.accent} />
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
  const glass = rgba(theme.colors.surface, 0.86);
  const glassStrong = rgba(theme.colors.surface, 0.94);
  const accentBorder = rgba(theme.circle.accent, 0.18);
  const accentWash = rgba(theme.circle.accent, 0.09);

  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  listContent: {
    flexGrow: 1,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 36,
  },
  row: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glass,
    shadowColor: theme.colors.text,
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  unreadRow: {
    backgroundColor: rgba(theme.circle.accent, 0.115),
    borderColor: rgba(theme.circle.accent, 0.30),
  },
  avatarWrap: { width: 54, height: 54, justifyContent: 'center' },
  systemAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
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
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glassStrong,
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
    minHeight: 400,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    marginBottom: 18,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glass,
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
    paddingHorizontal: 24,
    backgroundColor: theme.colors.bg,
  },
  stateCard: {
    minWidth: 190,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentBorder,
    backgroundColor: glassStrong,
  },
  stateText: {
    marginTop: 10,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  });
}
