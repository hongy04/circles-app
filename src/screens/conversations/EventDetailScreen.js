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
import { COLORS } from '../../theme/colors';
import {
  getEventDetails,
  removeEventGuest,
  respondToEvent,
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

function CountCard({ value, label }) {
  return (
    <View style={styles.countCard}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function AttendeeRow({ attendee, attendanceReviewed }) {
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
  return (
    <View style={styles.guestRow}>
      <View style={styles.guestAvatar}>
        <Ionicons
          name={guest.guestType === 'plus_one' ? 'people-outline' : 'person-outline'}
          size={20}
          color={COLORS.text}
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
            <Ionicons name="trash-outline" size={18} color={COLORS.subtext} />
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
  const typeLabel = invitation.guestType === 'plus_one'
    ? 'Plus-one invitation'
    : 'Guest invitation';

  return (
    <View style={styles.guestRow}>
      <View style={styles.pendingInviteAvatar}>
        <Ionicons name="link-outline" size={20} color={COLORS.text} />
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
              <Ionicons name="share-outline" size={18} color={COLORS.text} />
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
              <Ionicons name="trash-outline" size={18} color={COLORS.subtext} />
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

export function EventDetailScreen({ route, navigation }) {
  const { eventId } = route.params || {};
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!eventId) return;
    if (!quiet) setLoading(true);
    setError('');

    try {
      const [
        nextDetails,
        guestControlsEnabled,
        inviteLinksEnabled,
        photosEnabled,
        historyEnabled,
        sharedConnectionsEnabled,
      ] = await Promise.all([
        getEventDetails(eventId),
        isFeatureEnabled(FEATURE_FLAGS.EVENT_OUTSIDE_GUESTS),
        isFeatureEnabled(FEATURE_FLAGS.EVENT_GUEST_WEB_RSVP),
        isFeatureEnabled(FEATURE_FLAGS.EVENT_PHOTO_GALLERY),
        isFeatureEnabled(FEATURE_FLAGS.EVENT_HISTORY),
        isFeatureEnabled(FEATURE_FLAGS.SHARED_EVENT_CONNECTIONS),
      ]);
      setDetails(nextDetails);
      setOutsideGuestControlsEnabled(guestControlsEnabled);
      setGuestInviteLinksEnabled(inviteLinksEnabled);
      setEventPhotosEnabled(photosEnabled);
      setEventHistoryEnabled(historyEnabled);
      setSharedEventConnectionsEnabled(sharedConnectionsEnabled);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this event.');
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
  const isPastEvent = Boolean(event) && (
    event.isPast || event.status === 'completed' || new Date(event.startsAt).getTime() < Date.now()
  );
  const eventLocked = event?.status === 'completed' || event?.status === 'cancelled';

  if (loading && !event) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening event…</Text>
      </SafeAreaView>
    );
  }

  if (error && !event) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="calendar-outline" size={38} color={COLORS.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const header = event ? (
    <View>
      <View style={styles.heroCard}>
        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed" size={12} color={COLORS.subtext} />
          <Text style={styles.privacyText}>{formatCircleContext(event)}</Text>
        </View>

        <Text style={styles.title}>{event.title}</Text>

        {event.circleCount > 1 ? (
          <View style={styles.circleChips}>
            {event.circles.map((circle) => (
              <View key={circle.id} style={styles.circleChip}>
                <Ionicons name="people-outline" size={13} color={COLORS.text} />
                <Text style={styles.circleChipText} numberOfLines={1}>{circle.name}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.text} />
          </View>
          <Text style={styles.detailText}>
            {formatEventDate(event.startsAt, event.endsAt)}
          </Text>
        </View>

        {event.locationName ? (
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="location-outline" size={20} color={COLORS.text} />
            </View>
            <Text style={styles.detailText}>{event.locationName}</Text>
          </View>
        ) : null}

        <View style={styles.detailRow}>
          <Avatar size={40} name={event.hostName} uri={event.hostAvatar} />
          <View style={styles.hostCopy}>
            <Text style={styles.hostName}>{event.hostName}</Text>
            <Text style={styles.hostBody}>
              {event.circleCount > 1
                ? `Hosting across ${event.circleCount} Circles`
                : 'Hosting for this Circle'}
            </Text>
          </View>
        </View>

        {event.description ? <Text style={styles.description}>{event.description}</Text> : null}
      </View>

      <View style={styles.rsvpCard}>
        <Text style={styles.rsvpTitle}>
          {eventLocked ? 'Event completed' : 'Are you going?'}
        </Text>
        <Text style={styles.rsvpBody}>
          {eventLocked
            ? 'The original RSVP remains part of the event record. Attendance is tracked separately.'
            : 'Your answer is visible only to members of the Circles invited to this event.'}
        </Text>

        {!eventLocked ? (
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
                    <ActivityIndicator size="small" color={selected ? '#fff' : COLORS.text} />
                  ) : (
                    <Ionicons
                      name={option.icon}
                      size={19}
                      color={selected ? '#fff' : COLORS.text}
                    />
                  )}
                  <Text style={[
                    styles.rsvpButtonText,
                    selected && styles.rsvpButtonTextSelected,
                  ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={styles.countsRow}>
        <CountCard value={counts?.going || 0} label="Going" />
        <CountCard value={counts?.maybe || 0} label="Maybe" />
        <CountCard value={counts?.pending || 0} label="Waiting" />
      </View>

      {eventHistoryEnabled && isPastEvent ? (
        <View style={styles.historyCard}>
          <View style={styles.historyIcon}>
            <Ionicons
              name={event.attendanceReviewed ? 'checkmark-done-outline' : 'people-outline'}
              size={23}
              color={COLORS.text}
            />
          </View>
          <View style={styles.historyCopy}>
            <Text style={styles.historyTitle}>
              {event.attendanceReviewed
                ? 'Attendance reviewed'
                : (event.canManage ? 'Who made it?' : 'Past event')}
            </Text>
            <Text style={styles.historyBody}>
              {event.attendanceReviewed
                ? `${event.attendedCount} ${event.attendedCount === 1 ? 'person was' : 'people were'} marked as attended. Original RSVPs remain unchanged.`
                : (event.canManage
                  ? 'Review the guest list and record who actually attended. Going responses are only the starting suggestion.'
                  : 'The host has not reviewed attendance for this event.')}
            </Text>
          </View>
          {event.canManage ? (
            <Pressable
              onPress={() => navigation.navigate('EventAttendanceReview', {
                eventId,
                eventTitle: event.title,
              })}
              style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
            >
              <Text style={styles.historyButtonText}>
                {event.attendanceReviewed ? 'Review again' : 'Review'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {sharedEventConnectionsEnabled && event.attendanceReviewed ? (
        <Pressable
          onPress={() => navigation.navigate('EventConnections', {
            eventId,
            eventTitle: event.title,
          })}
          style={({ pressed }) => [
            styles.eventConnectionsCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.eventConnectionsIcon}>
            <Ionicons name="people-outline" size={23} color={COLORS.text} />
          </View>
          <View style={styles.eventConnectionsCopy}>
            <Text style={styles.eventConnectionsTitle}>People from this event</Text>
            <Text style={styles.eventConnectionsBody}>
              See confirmed app attendees. Shared attendance gives limited profile context, never automatic access.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.subtext} />
        </Pressable>
      ) : null}

      {eventPhotosEnabled ? (
        <Pressable
          onPress={() => navigation.navigate('EventPhotoGallery', {
            eventId,
            eventTitle: event.title,
          })}
          style={({ pressed }) => [
            styles.photoGalleryCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.photoGalleryIcon}>
            <Ionicons name="images-outline" size={23} color={COLORS.text} />
          </View>
          <View style={styles.photoGalleryCopy}>
            <Text style={styles.photoGalleryTitle}>Event photos</Text>
            <Text style={styles.photoGalleryBody}>
              Share photos from this gathering. Invited guests can view the gallery through their private link.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.subtext} />
        </Pressable>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Circle responses</Text>
        <Text style={styles.sectionCount}>{counts?.attendeeCount || 0} people</Text>
      </View>
    </View>
  ) : null;

  const guestFooter = event && (event.outsideGuestCap > 0 || event.canManage || guests.length > 0 || guestInvitations.length > 0) ? (
    <View style={styles.guestSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Outside guests</Text>
        <Text style={styles.sectionCount}>
          {event.reservedGuestCount}/{event.outsideGuestCap} spots
        </Text>
      </View>

      <View style={styles.guestPolicyCard}>
        <View style={styles.guestPolicyIcon}>
          <Ionicons name="shield-checkmark-outline" size={21} color={COLORS.text} />
        </View>
        <View style={styles.guestPolicyCopy}>
          <Text style={styles.guestPolicyTitle}>
            {event.outsideGuestCap > 0 ? 'Controlled guest list' : 'Outside guests are off'}
          </Text>
          <Text style={styles.guestPolicyBody}>
            {event.outsideGuestCap > 0
              ? `${guestInviteLinksEnabled
                ? (event.membersCanInviteGuests ? 'Circle members may create private guest invitations.' : 'Only the host may create private guest invitations.')
                : (event.membersCanInviteGuests ? 'Circle members may add named guests manually.' : 'Only the host may add named guests manually.')} ${event.allowPlusOnes ? 'Plus-ones are allowed.' : 'Plus-ones are off.'}${guestInviteLinksEnabled ? ' Recipients enter their own name and RSVP.' : ''}`
              : 'The host can enable named outside guests without exposing private Circle content.'}
          </Text>
        </View>
      </View>

      {outsideGuestControlsEnabled && !eventLocked && (event.canManage || event.canAddGuests) ? (
        <View style={styles.guestActionRow}>
          {event.canManage ? (
            <Pressable
              onPress={() => navigation.navigate('EventGuestSettings', { eventId })}
              style={({ pressed }) => [styles.secondaryGuestButton, pressed && styles.pressed]}
            >
              <Ionicons name="options-outline" size={18} color={COLORS.text} />
              <Text style={styles.secondaryGuestButtonText}>Settings</Text>
            </Pressable>
          ) : null}
          {event.canAddGuests ? (
            <Pressable
              onPress={() => navigation.navigate('AddEventGuest', {
                eventId,
                eventTitle: event.title,
                allowPlusOnes: event.allowPlusOnes,
                remainingGuestSlots: event.remainingGuestSlots,
                guestInviteLinksEnabled,
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
              attendanceReviewed={event.attendanceReviewed}
            />
          ))}
        </View>
      ) : event.outsideGuestCap > 0 ? (
        <View style={styles.emptyGuestCard}>
          <Text style={styles.emptyGuestTitle}>No outside guests yet</Text>
          <Text style={styles.emptyGuestBody}>
            Create a private invitation so the recipient can enter their own name and RSVP. Manual entry remains available as a fallback.
          </Text>
        </View>
      ) : null}
    </View>
  ) : null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={attendees}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={header}
        ListFooterComponent={guestFooter}
        renderItem={({ item }) => (
          <AttendeeRow attendee={item} attendanceReviewed={event?.attendanceReviewed} />
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
    paddingBottom: 46,
  },
  heroCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  privacyText: {
    color: COLORS.subtext,
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
    backgroundColor: '#f1f1f1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  circleChipText: {
    maxWidth: 210,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  title: {
    marginTop: 10,
    marginBottom: 17,
    color: COLORS.text,
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
    backgroundColor: '#f1f1f1',
  },
  detailText: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
  },
  hostCopy: { flex: 1 },
  hostName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  hostBody: {
    marginTop: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  description: {
    marginTop: 18,
    paddingTop: 17,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  rsvpCard: {
    marginTop: 12,
    padding: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  rsvpTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  rsvpBody: {
    marginTop: 4,
    color: COLORS.subtext,
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
    borderColor: COLORS.border,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  rsvpButtonSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  rsvpButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
  rsvpButtonTextSelected: { color: '#fff' },
  countsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  historyCard: {
    marginTop: 14,
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
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
    backgroundColor: '#f1f1f1',
  },
  historyCopy: { flex: 1, minWidth: 0 },
  historyTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  historyBody: {
    marginTop: 3,
    color: COLORS.subtext,
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
    backgroundColor: COLORS.primary,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
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
    backgroundColor: '#f1f1f1',
  },
  eventConnectionsCopy: { flex: 1 },
  eventConnectionsTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  eventConnectionsBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  photoGalleryCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
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
    backgroundColor: '#f1f1f1',
  },
  photoGalleryCopy: { flex: 1 },
  photoGalleryTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  photoGalleryBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  countCard: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
  },
  countValue: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 19,
  },
  countLabel: {
    marginTop: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 9,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  sectionCount: {
    color: COLORS.subtext,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeCopy: { flex: 1, marginHorizontal: 11 },
  attendeeName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  hostLabel: {
    marginTop: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#efefef',
  },
  statusPillText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  guestSection: { marginTop: 2 },
  guestPolicyCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    gap: 11,
  },
  guestPolicyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  guestPolicyCopy: { flex: 1 },
  guestPolicyTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  guestPolicyBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  guestActionRow: { flexDirection: 'row', gap: 9, marginTop: 10 },
  secondaryGuestButton: {
    minHeight: 44,
    flex: 1,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryGuestButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  primaryGuestButton: {
    minHeight: 44,
    flex: 1,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  guestAvatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  pendingInviteAvatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  guestCopy: { flex: 1, marginHorizontal: 10 },
  guestName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  guestMeta: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 9,
  },
  guestActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  guestStatusButton: {
    minWidth: 64,
    minHeight: 32,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestStatusText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
  },
  guestIconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGuestCard: {
    marginTop: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  emptyGuestTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  emptyGuestBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: COLORS.bg,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
    maxWidth: 420,
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
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.72 },
});
