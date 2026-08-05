import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';

import { Avatar } from '../../components/Avatar';
import { ThemeAtmosphere } from '../../components/ThemeAtmosphere';
import { ContinuityLoadingCard } from '../../components/ContinuityLoadingCard';
import { EventRepeatCard } from '../../components/events/EventRepeatCard';
import { EventLookHero } from '../../components/events/EventLookHero';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  getEventDetails,
  getEventRepeatSummary,
  recordEventRepeatPlanStarted,
  removeEventGuest,
  respondToEvent,
  setEventRepeatSignal,
  updateEventGuestResponse,
} from '../../services/eventService';
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
} from '../../services/featureFlagService';
import {
  reshareEventGuestInvitation,
  revokeEventGuestInvitation,
} from '../../services/eventGuestInviteService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';
import { removeEventCoverPhoto, uploadEventCoverPhoto } from '../../services/eventCoverService';

const EVENT_DETAIL_FOCUS_FRESH_MS = 10_000;

const RSVP_OPTIONS = [
  { status: 'going', label: 'Going', icon: 'checkmark-circle-outline' },
  { status: 'maybe', label: 'Maybe', icon: 'help-circle-outline' },
  { status: 'not_going', label: 'Can’t go', icon: 'close-circle-outline' },
];

const STATUS_LABELS = {
  going: 'Going',
  maybe: 'Maybe',
  not_going: 'Can’t go',
  pending: 'No response',
  invited: 'Invited',
};

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(77,185,229,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return `${date} · ${startTime}–${endTime}`;

  const endDate = end.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${date} at ${startTime} – ${endDate} at ${endTime}`;
}

function formatCircleContext(event) {
  const circles = event?.circles || [];
  if (circles.length === 0) return event?.circleName || 'Circle';
  if (circles.length === 1) return circles[0].name;
  if (circles.length === 2) return `${circles[0].name} + ${circles[1].name}`;
  return `${circles[0].name} + ${circles.length - 1} more Circles`;
}


function detailsFromEventSummary(summary, conversationId, circleName) {
  if (!summary?.id) return null;
  const guestCap = Number(summary.guestCap || 0);
  const guestCount = Number(summary.guestCount || 0);
  const circleCount = Math.max(1, Number(summary.circleCount || 1));
  return {
    event: {
      ...summary,
      circleId: conversationId || null,
      circleName: circleName || 'Circle',
      circleCount,
      circles: circleCount === 1 && conversationId
        ? [{ id: conversationId, name: circleName || 'Circle' }]
        : [],
      canManage: false,
      outsideGuestCap: guestCap,
      membersCanInviteGuests: false,
      allowPlusOnes: false,
      pendingGuestInvitationCount: 0,
      reservedGuestCount: guestCount,
      remainingGuestSlots: Math.max(guestCap - guestCount, 0),
      canAddGuests: false,
      isPast: summary.status === 'completed'
        || (summary.startsAt ? new Date(summary.startsAt).getTime() < Date.now() : false),
      attendanceReviewed: Boolean(summary.attendanceReviewedAt),
      attendanceReviewedAt: summary.attendanceReviewedAt || null,
      completedAt: summary.completedAt || null,
      attendedCount: Number(summary.attendedCount || 0),
      appearanceKey: summary.appearanceKey || 'circle',
      attendanceSource: summary.attendanceSource || null,
    },
    counts: {
      attendeeCount: Number(summary.attendeeCount || 0),
      going: Number(summary.goingCount || 0),
      maybe: Number(summary.maybeCount || 0),
      notGoing: Number(summary.notGoingCount || 0),
      pending: Number(summary.pendingCount || 0),
      guestCount,
      pendingGuestInvitations: 0,
      reservedGuestCount: guestCount,
      guestGoing: 0,
      guestMaybe: 0,
      guestInvited: 0,
      guestNotGoing: 0,
    },
    attendees: [],
    guests: [],
    guestInvitations: [],
  };
}

function CountCard({ value, label }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.countCard}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function AttendeeRow({ attendee, attendanceReviewed }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.attendeeRow}>
      <Avatar
        size={46}
        name={attendee.displayName}
        uri={attendee.avatarUri}
      />
      <View style={styles.attendeeCopy}>
        <Text style={styles.attendeeName} numberOfLines={1}>
          {attendee.isMe ? 'You' : attendee.displayName}
        </Text>
        {attendee.isHost ? <Text style={styles.hostLabel}>Host</Text> : null}
      </View>
      <View style={styles.statusPill}>
        <Text style={styles.statusPillText}>
          {attendanceReviewed
            ? (attendee.attended ? 'Attended' : 'Didn’t attend')
            : (STATUS_LABELS[attendee.rsvpStatus] || 'No response')}
        </Text>
      </View>
    </View>
  );
}

function GuestRow({
  guest,
  busy,
  controlsEnabled,
  onChangeStatus,
  onRemove,
  attendanceReviewed,
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.guestRow}>
      <View style={styles.guestAvatar}>
        <Ionicons
          name={guest.guestType === 'plus_one' ? 'people-outline' : 'person-outline'}
          size={20}
          color={theme.colors.text}
        />
      </View>
      <View style={styles.guestCopy}>
        <Text style={styles.guestName} numberOfLines={1}>{guest.displayName}</Text>
        <Text style={styles.guestMeta} numberOfLines={1}>
          {guest.guestType === 'plus_one' ? 'Plus-one' : 'Outside guest'} · invited by {guest.invitedByName}
        </Text>
      </View>

      {guest.canManage && controlsEnabled ? (
        <View style={styles.guestActions}>
          <Pressable
            onPress={() => onChangeStatus(guest)}
            disabled={busy}
            style={({ pressed }) => [styles.guestStatusButton, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={styles.guestStatusText}>
                {attendanceReviewed
                  ? (guest.attended ? 'Attended' : 'Didn’t attend')
                  : (STATUS_LABELS[guest.status] || 'Invited')}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => onRemove(guest)}
            disabled={busy}
            hitSlop={8}
            style={({ pressed }) => [styles.guestIconButton, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.subtext} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>
            {attendanceReviewed
              ? (guest.attended ? 'Attended' : 'Didn’t attend')
              : (STATUS_LABELS[guest.status] || 'Invited')}
          </Text>
        </View>
      )}
    </View>
  );
}

function GuestInvitationRow({ invitation, busy, sharing, onShare, onRevoke }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const typeLabel = invitation.guestType === 'plus_one'
    ? 'Plus-one invitation'
    : 'Guest invitation';

  return (
    <View style={styles.guestRow}>
      <View style={styles.pendingInviteAvatar}>
        <Ionicons name="link-outline" size={20} color={theme.colors.text} />
      </View>
      <View style={styles.guestCopy}>
        <Text style={styles.guestName} numberOfLines={1}>{typeLabel}</Text>
        <Text style={styles.guestMeta} numberOfLines={1}>
          Waiting for response · invited by {invitation.invitedByName}
        </Text>
      </View>

      {invitation.canManage ? (
        <View style={styles.guestActions}>
          <Pressable
            onPress={() => onShare(invitation)}
            disabled={busy || sharing}
            hitSlop={8}
            style={({ pressed }) => [styles.guestIconButton, pressed && styles.pressed]}
          >
            {sharing ? (
              <ActivityIndicator size="small" />
            ) : (
              <Ionicons name="share-outline" size={18} color={theme.colors.text} />
            )}
          </Pressable>
          <Pressable
            onPress={() => onRevoke(invitation)}
            disabled={busy || sharing}
            hitSlop={8}
            style={({ pressed }) => [styles.guestIconButton, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator size="small" />
            ) : (
              <Ionicons name="trash-outline" size={18} color={theme.colors.subtext} />
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>Waiting</Text>
        </View>
      )}
    </View>
  );
}

function EventDetailContent({ route, navigation }) {
  const { eventId, eventTitle = 'Event', conversationId, circleName = 'Circle' } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const initialSnapshot = useMemo(() => {
    const cachedDetails = readNavigationCache(navigationCacheKeys.eventDetails(eventId));
    const cachedSummary = readNavigationCache(navigationCacheKeys.eventSummary(eventId));
    return {
      details: cachedDetails || detailsFromEventSummary(cachedSummary, conversationId, circleName),
      hasFullDetails: Boolean(cachedDetails),
    };
  }, [circleName, conversationId, eventId]);
  const initialDetails = initialSnapshot.details;
  const [details, setDetails] = useState(initialDetails || null);
  const [loading, setLoading] = useState(!initialSnapshot.hasFullDetails);
  const hasLoadedRef = useRef(initialSnapshot.hasFullDetails);
  const lastRefreshAtRef = useRef(initialSnapshot.hasFullDetails ? Date.now() : 0);
  const loadInFlightRef = useRef(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState('');
  const [updatingGuestId, setUpdatingGuestId] = useState('');
  const [sharingInvitationId, setSharingInvitationId] = useState('');
  const [updatingInvitationId, setUpdatingInvitationId] = useState('');
  const [outsideGuestControlsEnabled, setOutsideGuestControlsEnabled] = useState(true);
  const [guestInviteLinksEnabled, setGuestInviteLinksEnabled] = useState(true);
  const [eventPhotosEnabled, setEventPhotosEnabled] = useState(true);
  const [eventHistoryEnabled, setEventHistoryEnabled] = useState(true);
  const [sharedEventConnectionsEnabled, setSharedEventConnectionsEnabled] = useState(true);
  const [repeatSignalsEnabled, setRepeatSignalsEnabled] = useState(true);
  const [repeatSummary, setRepeatSummary] = useState(null);
  const [updatingRepeatSignal, setUpdatingRepeatSignal] = useState(false);
  const [planningRepeatEvent, setPlanningRepeatEvent] = useState(false);
  const [error, setError] = useState('');
  const [updatingCover, setUpdatingCover] = useState(false);

  const load = useCallback(async ({ quiet = false, force = false } = {}) => {
    if (!eventId) return;
    if (loadInFlightRef.current) return loadInFlightRef.current;
    if (!quiet) setLoading(true);
    setError('');

    const request = (async () => {
    try {
      const [
        nextDetails,
        guestControlsEnabled,
        inviteLinksEnabled,
        photosEnabled,
        historyEnabled,
        sharedConnectionsEnabled,
        repeatSignalsAvailable,
      ] = await Promise.all([
        getEventDetails(eventId),
        isFeatureEnabled(FEATURE_FLAGS.EVENT_OUTSIDE_GUESTS),
        isFeatureEnabled(FEATURE_FLAGS.EVENT_GUEST_WEB_RSVP),
        isFeatureEnabled(FEATURE_FLAGS.EVENT_PHOTO_GALLERY),
        isFeatureEnabled(FEATURE_FLAGS.EVENT_HISTORY),
        isFeatureEnabled(FEATURE_FLAGS.SHARED_EVENT_CONNECTIONS),
        isFeatureEnabled(FEATURE_FLAGS.EVENT_REPEAT_SIGNALS),
      ]);
      setDetails(nextDetails);
      lastRefreshAtRef.current = Date.now();
      writeNavigationCache(navigationCacheKeys.eventDetails(eventId), nextDetails);
      setOutsideGuestControlsEnabled(guestControlsEnabled);
      setGuestInviteLinksEnabled(inviteLinksEnabled);
      setEventPhotosEnabled(photosEnabled);
      setEventHistoryEnabled(historyEnabled);
      setSharedEventConnectionsEnabled(sharedConnectionsEnabled);
      setRepeatSignalsEnabled(repeatSignalsAvailable);

      if (repeatSignalsAvailable && nextDetails?.event?.attendanceReviewed) {
        try {
          setRepeatSummary(await getEventRepeatSummary(eventId));
        } catch {
          setRepeatSummary(null);
        }
      } else {
        setRepeatSummary(null);
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this event.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    })();

    loadInFlightRef.current = request.finally(() => {
      loadInFlightRef.current = null;
    });
    return loadInFlightRef.current;
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      const isFresh = hasLoadedRef.current
        && Date.now() - lastRefreshAtRef.current < EVENT_DETAIL_FOCUS_FRESH_MS;
      if (!isFresh) {
        void load({ quiet: hasLoadedRef.current || Boolean(initialDetails) }).finally(() => {
          hasLoadedRef.current = true;
        });
      }
    }, [initialDetails, load])
  );

  const chooseEventCover = async () => {
    if (!eventId || updatingCover) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos permission needed', 'Allow photo access to choose an event photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.9,
      selectionLimit: 1,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset?.uri) return;

    setUpdatingCover(true);
    try {
      const cover = await uploadEventCoverPhoto({ eventId, asset });
      setDetails((current) => {
        if (!current?.event) return current;
        const next = {
          ...current,
          event: {
            ...current.event,
            coverStoragePath: cover.storagePath,
            coverUrl: cover.url || asset.uri,
            coverWidth: cover.width,
            coverHeight: cover.height,
            coverUpdatedAt: new Date().toISOString(),
          },
        };
        writeNavigationCache(navigationCacheKeys.eventDetails(eventId), next);
        return next;
      });
      if (!cover.url) void load({ quiet: true, force: true });
    } catch (coverError) {
      Alert.alert('Could not update event photo', coverError?.message || 'Please try again.');
    } finally {
      setUpdatingCover(false);
    }
  };

  const removeCurrentEventCover = async () => {
    if (!eventId || updatingCover) return;
    setUpdatingCover(true);
    try {
      await removeEventCoverPhoto(eventId);
      setDetails((current) => {
        if (!current?.event) return current;
        const next = {
          ...current,
          event: {
            ...current.event,
            coverStoragePath: null,
            coverUrl: null,
            coverWidth: null,
            coverHeight: null,
            coverUpdatedAt: new Date().toISOString(),
          },
        };
        writeNavigationCache(navigationCacheKeys.eventDetails(eventId), next);
        return next;
      });
    } catch (coverError) {
      Alert.alert('Could not remove event photo', coverError?.message || 'Please try again.');
    } finally {
      setUpdatingCover(false);
    }
  };

  const manageEventCover = () => {
    if (updatingCover) return;
    if (!details?.event?.coverUrl) {
      void chooseEventCover();
      return;
    }
    Alert.alert(
      'Event photo',
      'Change the custom event photo or return to the selected preset Event Look.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use preset instead', style: 'destructive', onPress: removeCurrentEventCover },
        { text: 'Choose another photo', onPress: chooseEventCover },
      ]
    );
  };

  const updateRsvp = async (status) => {
    if (updatingStatus || status === details?.event?.viewerRsvpStatus) return;
    setUpdatingStatus(status);

    try {
      await respondToEvent(eventId, status);
      await load({ quiet: true });
    } catch (updateError) {
      Alert.alert(
        'Could not update RSVP',
        updateError?.message || 'Please try again.'
      );
    } finally {
      setUpdatingStatus('');
    }
  };

  const setGuestStatus = async (guest, status) => {
    if (updatingGuestId) return;
    setUpdatingGuestId(guest.id);
    try {
      await updateEventGuestResponse(guest.id, status);
      await load({ quiet: true });
    } catch (updateError) {
      Alert.alert(
        'Could not update guest',
        updateError?.message || 'Please try again.'
      );
    } finally {
      setUpdatingGuestId('');
    }
  };

  const chooseGuestStatus = (guest) => {
    Alert.alert(
      guest.displayName,
      'Update this guest’s response.',
      [
        { text: 'Going', onPress: () => setGuestStatus(guest, 'going') },
        { text: 'Maybe', onPress: () => setGuestStatus(guest, 'maybe') },
        {
          text: 'More',
          onPress: () => Alert.alert(
            guest.displayName,
            'Choose another response.',
            [
              { text: 'Invited', onPress: () => setGuestStatus(guest, 'invited') },
              { text: 'Can’t go', onPress: () => setGuestStatus(guest, 'not_going') },
              { text: 'Cancel', style: 'cancel' },
            ]
          ),
        },
      ]
    );
  };

  const sharePendingInvitation = (invitation) => {
    Alert.alert(
      'Share this guest invitation again?',
      'A fresh private link will replace the older link for this reserved guest spot.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create & Share',
          onPress: async () => {
            if (sharingInvitationId || updatingInvitationId) return;
            setSharingInvitationId(invitation.id);
            try {
              await reshareEventGuestInvitation({
                invitationId: invitation.id,
                eventTitle: details?.event?.title,
              });
            } catch (shareError) {
              Alert.alert(
                'Could not share guest invitation',
                shareError?.message || 'Please try again.'
              );
            } finally {
              setSharingInvitationId('');
            }
          },
        },
      ]
    );
  };

  const confirmRevokeInvitation = (invitation) => {
    Alert.alert(
      'Revoke this guest invitation?',
      'The private link will stop working and the reserved guest spot will become available again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            if (updatingInvitationId || sharingInvitationId) return;
            setUpdatingInvitationId(invitation.id);
            try {
              await revokeEventGuestInvitation(invitation.id);
              await load({ quiet: true });
            } catch (revokeError) {
              Alert.alert(
                'Could not revoke invitation',
                revokeError?.message || 'Please try again.'
              );
            } finally {
              setUpdatingInvitationId('');
            }
          },
        },
      ]
    );
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

  const planAnotherEvent = async () => {
    if (planningRepeatEvent || !details?.event) return;
    setPlanningRepeatEvent(true);

    try {
      await recordEventRepeatPlanStarted(eventId);
      const currentEvent = details.event;
      navigation.navigate('CreateEvent', {
        conversationId: currentEvent.circleId,
        circleName: currentEvent.circleName,
        repeatFrom: {
          sourceEventId: currentEvent.id,
          title: currentEvent.title,
          description: currentEvent.description,
          locationName: currentEvent.locationName,
          circleIds: (currentEvent.circles || []).map((circle) => circle.id),
          outsideGuestCap: currentEvent.outsideGuestCap,
          membersCanInviteGuests: currentEvent.membersCanInviteGuests,
          allowPlusOnes: currentEvent.allowPlusOnes,
          appearanceKey: currentEvent.appearanceKey || 'circle',
        },
      });
    } catch (repeatError) {
      Alert.alert(
        'Could not start another event',
        repeatError?.message || 'Please try again.'
      );
    } finally {
      setPlanningRepeatEvent(false);
    }
  };

  const confirmRemoveGuest = (guest) => {
    Alert.alert(
      `Remove ${guest.displayName}?`,
      'This removes the named guest from this event only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (updatingGuestId) return;
            setUpdatingGuestId(guest.id);
            try {
              await removeEventGuest(guest.id, guest.guestType);
              await load({ quiet: true });
            } catch (removeError) {
              Alert.alert(
                'Could not remove guest',
                removeError?.message || 'Please try again.'
              );
            } finally {
              setUpdatingGuestId('');
            }
          },
        },
      ]
    );
  };

  const event = details?.event;
  const counts = details?.counts;
  const attendees = details?.attendees || [];
  const guests = details?.guests || [];
  const guestInvitations = details?.guestInvitations || [];
  const eventEndAt = event?.endsAt || event?.startsAt || null;
  const isPastEvent = Boolean(event) && (
    event.status === 'completed'
    || (eventEndAt ? new Date(eventEndAt).getTime() <= Date.now() : false)
  );
  const eventLocked = isPastEvent || event?.status === 'completed' || event?.status === 'cancelled';
  const attendanceFinalized = Boolean(event?.attendanceReviewed);
  const visibleAttendees = attendees.filter((attendee) => (
    isPastEvent && attendanceFinalized
      ? attendee.attended
      : attendee.rsvpStatus === 'going' || attendee.rsvpStatus === 'maybe'
  ));

  if (!event) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <View style={styles.content}>
          <View style={styles.heroCard}>
            <View style={styles.privacyRow}>
              <Ionicons name="lock-closed" size={12} color={theme.colors.subtext} />
              <Text style={styles.privacyText}>{circleName}</Text>
            </View>
            <Text style={styles.title}>{eventTitle}</Text>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="calendar-outline" size={20} color={theme.colors.text} />
              </View>
              <Text style={styles.detailText}>Loading event details…</Text>
            </View>
          </View>

          <ContinuityLoadingCard
            label="Opening event…"
            body="The event page is already visible while RSVP and attendee details load."
            icon="calendar-outline"
            error={error}
            onRetry={error ? () => load() : undefined}
          />
        </View>
      </SafeAreaView>
    );
  }

  const header = event ? (
    <View>
      <EventLookHero
        appearanceKey={event.appearanceKey || 'circle'}
        coverUri={event.coverUrl || null}
        circleLabel={formatCircleContext(event)}
        title={event.title}
        dateLabel={formatEventDate(event.startsAt, event.endsAt)}
        locationLabel={event.locationName}
        isPast={isPastEvent}
        isCancelled={event.status === 'cancelled'}
      />

      <View style={styles.hostStrip}>
        <Avatar size={38} name={event.hostName} uri={event.hostAvatar} />
        <View style={styles.hostCopy}>
          <Text style={styles.hostName}>Hosted by {event.hostName}</Text>
          <Text style={styles.hostBody}>
            {event.circleCount > 1
              ? `Shared across ${event.circleCount} Circles`
              : 'A private Circle gathering'}
          </Text>
        </View>
        {event.canManage ? (
          <Pressable
            onPress={manageEventCover}
            disabled={updatingCover}
            style={({ pressed }) => [styles.coverButton, (pressed || updatingCover) && styles.pressed]}
          >
            {updatingCover ? (
              <ActivityIndicator size="small" color={theme.colors.text} />
            ) : (
              <Ionicons name={event.coverUrl ? 'images-outline' : 'image-outline'} size={15} color={theme.colors.text} />
            )}
            <Text style={styles.coverButtonText}>{event.coverUrl ? 'Change photo' : 'Add photo'}</Text>
          </Pressable>
        ) : event.circleCount > 1 ? (
          <View style={styles.circleCountPill}>
            <Ionicons name="people-outline" size={13} color={theme.colors.text} />
            <Text style={styles.circleCountPillText}>{event.circleCount}</Text>
          </View>
        ) : null}
      </View>

      {event.description ? (
        <View style={styles.noteCard}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.subtext} />
          <Text style={styles.noteText}>{event.description}</Text>
        </View>
      ) : null}

      {!eventLocked ? (
        <View style={styles.rsvpCard}>
          <View style={styles.rsvpHeadingRow}>
            <View>
              <Text style={styles.rsvpEyebrow}>YOUR RSVP</Text>
              <Text style={styles.rsvpTitle}>Are you going?</Text>
            </View>
            <View style={styles.currentRsvpPill}>
              <Text style={styles.currentRsvpText}>
                {STATUS_LABELS[event.viewerRsvpStatus] || 'No response'}
              </Text>
            </View>
          </View>

          <View style={styles.rsvpButtons}>
            {RSVP_OPTIONS.map((option) => {
              const selected = event.viewerRsvpStatus === option.status;
              const busy = updatingStatus === option.status;
              return (
                <Pressable
                  key={option.status}
                  onPress={() => updateRsvp(option.status)}
                  disabled={Boolean(updatingStatus)}
                  style={({ pressed }) => [
                    styles.rsvpButton,
                    selected && styles.rsvpButtonSelected,
                    (pressed || busy) && styles.pressed,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={selected ? '#fff' : theme.colors.text} />
                  ) : (
                    <Ionicons
                      name={option.icon}
                      size={18}
                      color={selected ? '#fff' : theme.colors.text}
                    />
                  )}
                  <Text style={[styles.rsvpButtonText, selected && styles.rsvpButtonTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.responseStrip}>
            <View style={styles.responseMetric}>
              <Text style={styles.responseValue}>{counts?.going || 0}</Text>
              <Text style={styles.responseLabel}>going</Text>
            </View>
            <View style={styles.responseDot} />
            <View style={styles.responseMetric}>
              <Text style={styles.responseValue}>{counts?.maybe || 0}</Text>
              <Text style={styles.responseLabel}>maybe</Text>
            </View>
            <View style={styles.responseDot} />
            <View style={styles.responseMetric}>
              <Text style={styles.responseValue}>{counts?.pending || 0}</Text>
              <Text style={styles.responseLabel}>waiting</Text>
            </View>
          </View>
        </View>
      ) : null}

      {eventHistoryEnabled && isPastEvent ? (
        <View style={styles.memoryCard}>
          <View style={styles.memoryIcon}>
            <Ionicons
              name={attendanceFinalized ? 'sparkles-outline' : 'time-outline'}
              size={22}
              color={theme.colors.text}
            />
          </View>
          <View style={styles.memoryCopy}>
            <Text style={styles.memoryEyebrow}>AFTER THE GATHERING</Text>
            <Text style={styles.memoryTitle}>
              {attendanceFinalized
                ? (event.attendanceSource === 'host_reviewed' ? 'Attendance corrected by the host' : 'Attendance remembered from RSVPs')
                : 'We’ll remember attendance automatically'}
            </Text>
            <Text style={styles.memoryBody}>
              {attendanceFinalized
                ? `${event.attendedCount} ${event.attendedCount === 1 ? 'person is' : 'people are'} in the attendance record.${event.attendanceSource === 'host_reviewed' ? ' The host adjusted the original RSVP-based record.' : ' Going responses became the starting attendance record.'}`
                : 'The next morning, Going responses become the attendance record automatically. The host only needs to step in if something changed.'}
            </Text>
          </View>
          {event.canManage ? (
            <Pressable
              onPress={() => navigation.navigate('EventAttendanceReview', {
                eventId,
                eventTitle: event.title,
                conversationId,
                circleName,
                appearanceKey: event.appearanceKey || 'circle',
                coverUri: event.coverUrl || null,
                eventStartsAt: event.startsAt || null,
                eventEndsAt: event.endsAt || null,
                eventLocation: event.locationName || '',
              })}
              style={({ pressed }) => [styles.memoryButton, pressed && styles.pressed]}
            >
              <Text style={styles.memoryButtonText}>Correct</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionGrid}>
        {eventPhotosEnabled ? (
          <Pressable
            onPress={() => navigation.navigate('EventPhotoGallery', {
              eventId,
              eventTitle: event.title,
              conversationId,
              circleName,
              appearanceKey: event.appearanceKey || 'circle',
              coverUri: event.coverUrl || null,
              eventStartsAt: event.startsAt || null,
              eventEndsAt: event.endsAt || null,
              eventLocation: event.locationName || '',
            })}
            style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="images-outline" size={22} color={theme.colors.text} />
            </View>
            <Text style={styles.actionTitle}>Photos</Text>
            <Text style={styles.actionBody}>Keep the gathering together.</Text>
          </Pressable>
        ) : null}

        {sharedEventConnectionsEnabled && attendanceFinalized ? (
          <Pressable
            onPress={() => navigation.navigate('EventConnections', {
              eventId,
              eventTitle: event.title,
              conversationId,
              circleName,
              appearanceKey: event.appearanceKey || 'circle',
              coverUri: event.coverUrl || null,
              eventStartsAt: event.startsAt || null,
              eventEndsAt: event.endsAt || null,
              eventLocation: event.locationName || '',
            })}
            style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="people-outline" size={22} color={theme.colors.text} />
            </View>
            <Text style={styles.actionTitle}>People</Text>
            <Text style={styles.actionBody}>Reconnect through shared attendance.</Text>
          </Pressable>
        ) : null}
      </View>

      {repeatSignalsEnabled && attendanceFinalized && repeatSummary?.available ? (
        <EventRepeatCard
          summary={repeatSummary}
          updating={updatingRepeatSignal}
          planning={planningRepeatEvent}
          onToggle={updateRepeatSignal}
          onPlanAnother={repeatSummary.isHost ? planAnotherEvent : undefined}
        />
      ) : null}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>{isPastEvent ? 'THE MEMORY' : 'THE GUEST LIST'}</Text>
          <Text style={styles.sectionTitle}>
            {isPastEvent ? (attendanceFinalized ? 'Who was there' : 'Who planned to come') : 'Who’s coming'}
          </Text>
        </View>
        <Text style={styles.sectionCount}>
          {visibleAttendees.length} {visibleAttendees.length === 1 ? 'person' : 'people'}
        </Text>
      </View>
    </View>
  ) : null;

  const guestFooter = event && (event.outsideGuestCap > 0 || event.canManage || guests.length > 0 || guestInvitations.length > 0) ? (
    <View style={styles.guestSection}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>OUTSIDE THE CIRCLE</Text>
          <Text style={styles.sectionTitle}>Guests</Text>
        </View>
        <Text style={styles.sectionCount}>
          {event.reservedGuestCount}/{event.outsideGuestCap || 0} spots
        </Text>
      </View>

      {event.outsideGuestCap > 0 ? (
        <Text style={styles.guestPolicyLine}>
          {event.membersCanInviteGuests ? 'Members can invite' : 'Host invites'}
          {'  ·  '}
          {event.allowPlusOnes ? 'Plus-ones on' : 'No plus-ones'}
        </Text>
      ) : null}

      {outsideGuestControlsEnabled && !eventLocked && (event.canManage || event.canAddGuests) ? (
        <View style={styles.guestActionRow}>
          {event.canManage ? (
            <Pressable
              onPress={() => navigation.navigate('EventGuestSettings', { eventId, eventTitle: event.title, conversationId, circleName, appearanceKey: event.appearanceKey || 'circle', coverUri: event.coverUrl || null, eventStartsAt: event.startsAt || null, eventEndsAt: event.endsAt || null, eventLocation: event.locationName || '' })}
              style={({ pressed }) => [styles.secondaryGuestButton, pressed && styles.pressed]}
            >
              <Ionicons name="options-outline" size={18} color={theme.colors.text} />
              <Text style={styles.secondaryGuestButtonText}>Settings</Text>
            </Pressable>
          ) : null}
          {event.canAddGuests ? (
            <Pressable
              onPress={() => navigation.navigate('AddEventGuest', {
                eventId,
                eventTitle: event.title,
                conversationId,
                circleName,
                allowPlusOnes: event.allowPlusOnes,
                remainingGuestSlots: event.remainingGuestSlots,
                guestInviteLinksEnabled,
                appearanceKey: event.appearanceKey || 'circle',
                coverUri: event.coverUrl || null,
                eventStartsAt: event.startsAt || null,
                eventEndsAt: event.endsAt || null,
                eventLocation: event.locationName || '',
              })}
              style={({ pressed }) => [styles.primaryGuestButton, pressed && styles.pressed]}
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={styles.primaryGuestButtonText}>{guestInviteLinksEnabled ? 'Invite Guest' : 'Add Guest'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {guestInvitations.length > 0 || guests.length > 0 ? (
        <View style={styles.guestList}>
          {guestInvitations.map((invitation) => (
            <GuestInvitationRow
              key={invitation.id}
              invitation={invitation}
              busy={updatingInvitationId === invitation.id}
              sharing={sharingInvitationId === invitation.id}
              onShare={sharePendingInvitation}
              onRevoke={confirmRevokeInvitation}
            />
          ))}
          {guests.map((guest) => (
            <GuestRow
              key={guest.id}
              guest={guest}
              busy={updatingGuestId === guest.id}
              controlsEnabled={outsideGuestControlsEnabled && !eventLocked}
              onChangeStatus={chooseGuestStatus}
              onRemove={confirmRemoveGuest}
              attendanceReviewed={attendanceFinalized}
            />
          ))}
        </View>
      ) : loading && Number(event.guestCount || 0) > 0 ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={theme.circle.accent} />
        </View>
      ) : event.outsideGuestCap > 0 ? (
        <View style={styles.emptyGuestCard}>
          <Text style={styles.emptyGuestTitle}>No outside guests yet</Text>
          <Text style={styles.emptyGuestBody}>Invite someone when it adds to the gathering. They still won’t see private Circle content.</Text>
        </View>
      ) : null}
    </View>
  ) : null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ThemeAtmosphere theme={theme} strength={0.48} decals />
      <FlatList
        data={visibleAttendees}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={header}
        ListFooterComponent={guestFooter}
        renderItem={({ item }) => (
          <AttendeeRow attendee={item} attendanceReviewed={event?.attendanceReviewed} />
        )}
        ListEmptyComponent={loading ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color={theme.circle.accent} />
          </View>
        ) : (
          <View style={styles.emptyAttendeeCard}>
            <Ionicons name={isPastEvent ? 'sparkles-outline' : 'people-outline'} size={20} color={theme.colors.subtext} />
            <Text style={styles.emptyAttendeeText}>
              {isPastEvent ? 'Attendance will settle here automatically, or the host can correct it.' : 'No one has marked Going or Maybe yet.'}
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

export function EventDetailScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <EventDetailContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  const glass = rgba(theme.colors.surface, 0.86);
  const glassStrong = rgba(theme.colors.surface, 0.94);
  const accentLine = rgba(theme.circle.accent, 0.20);
  const accentWash = rgba(theme.circle.accent, 0.10);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 46,
  },
  inlineLoading: { minHeight: 84, alignItems: 'center', justifyContent: 'center' },
  heroCard: {
    padding: 20,
    overflow: 'hidden',
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
  circleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 7,
  },
  circleChip: {
    maxWidth: '100%',
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: theme.circle.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  circleChipText: {
    maxWidth: 210,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  title: {
    marginTop: 10,
    marginBottom: 17,
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 25,
    lineHeight: 31,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 12,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  detailText: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
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
    borderTopColor: theme.circle.accentSoft,
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  hostStrip: {
    marginTop: 13,
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  coverButton: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: accentWash,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  coverButtonText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 9 },
  circleCountPill: {
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: accentWash,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  circleCountPillText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 10 },
  noteCard: {
    marginTop: 10,
    padding: 14,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  noteText: { flex: 1, color: theme.colors.text, fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19 },
  rsvpCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glassStrong,
  },
  rsvpHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rsvpEyebrow: { color: theme.colors.subtext, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.9 },
  currentRsvpPill: { minHeight: 29, paddingHorizontal: 10, borderRadius: 999, backgroundColor: accentWash, justifyContent: 'center' },
  currentRsvpText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 10 },
  rsvpTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  rsvpBody: {
    marginTop: 4,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  rsvpButtons: { flexDirection: 'row', gap: 7, marginTop: 15 },
  rsvpButton: {
    flex: 1,
    minHeight: 47,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.circle.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  rsvpButtonSelected: {
    borderColor: theme.welcome.brandInk,
    backgroundColor: theme.welcome.brandInk,
  },
  rsvpButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
  rsvpButtonTextSelected: { color: '#fff' },
  responseStrip: {
    marginTop: 14,
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: accentWash,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  responseMetric: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  responseValue: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  responseLabel: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 9 },
  responseDot: { width: 3, height: 3, borderRadius: 999, backgroundColor: rgba(theme.colors.subtext, 0.46) },
  countsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  historyCard: {
    marginTop: 14,
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  historyCopy: { flex: 1, minWidth: 0 },
  historyTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  historyBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  historyButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.welcome.brandInk,
  },
  historyButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  eventConnectionsCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  eventConnectionsIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  eventConnectionsCopy: { flex: 1 },
  eventConnectionsTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  eventConnectionsBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  photoGalleryCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  photoGalleryIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  photoGalleryCopy: { flex: 1 },
  photoGalleryTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  photoGalleryBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  countCard: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  countValue: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 19,
  },
  countLabel: {
    marginTop: 1,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  memoryCard: {
    marginTop: 13,
    padding: 15,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  memoryIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: accentWash },
  memoryCopy: { flex: 1, minWidth: 0 },
  memoryEyebrow: { color: theme.colors.subtext, fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 0.8 },
  memoryTitle: { marginTop: 2, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 18 },
  memoryBody: { marginTop: 4, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 10, lineHeight: 15 },
  memoryButton: { minHeight: 35, paddingHorizontal: 11, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.welcome.brandInk },
  memoryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 10 },
  actionGrid: { flexDirection: 'row', gap: 9, marginTop: 12 },
  actionTile: {
    flex: 1,
    minHeight: 116,
    padding: 14,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: accentWash, marginBottom: 10 },
  actionTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  actionBody: { marginTop: 3, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 9, lineHeight: 14 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 9,
    paddingHorizontal: 2,
  },
  sectionEyebrow: { color: theme.colors.subtext, fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 0.8, marginBottom: 2 },
  sectionTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  sectionCount: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  attendeeRow: {
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: glassStrong,
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeCopy: { flex: 1, marginHorizontal: 11 },
  attendeeName: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  hostLabel: {
    marginTop: 1,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.circle.accentSoft,
  },
  statusPillText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  guestSection: { marginTop: 2 },
  guestPolicyCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    gap: 11,
  },
  guestPolicyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  guestPolicyCopy: { flex: 1 },
  guestPolicyTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  guestPolicyBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  guestPolicyLine: {
    marginTop: -2,
    marginBottom: 9,
    paddingHorizontal: 2,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
  },
  guestActionRow: { flexDirection: 'row', gap: 9, marginTop: 4 },
  secondaryGuestButton: {
    minHeight: 44,
    flex: 1,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryGuestButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  primaryGuestButton: {
    minHeight: 44,
    flex: 1,
    borderRadius: 11,
    backgroundColor: theme.welcome.brandInk,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryGuestButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  guestList: { marginTop: 10 },
  guestRow: {
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: glassStrong,
    flexDirection: 'row',
    alignItems: 'center',
  },
  guestAvatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  pendingInviteAvatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
  },
  guestCopy: { flex: 1, marginHorizontal: 10 },
  guestName: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  guestMeta: {
    marginTop: 2,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 9,
  },
  guestActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  guestStatusButton: {
    minWidth: 64,
    minHeight: 32,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: theme.circle.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestStatusText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
  },
  guestIconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAttendeeCard: {
    minHeight: 74,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  emptyAttendeeText: { flex: 1, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11, lineHeight: 16 },
  emptyGuestCard: {
    marginTop: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
  },
  emptyGuestTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  emptyGuestBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
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
  pressed: { opacity: 0.72 },
  });
}
