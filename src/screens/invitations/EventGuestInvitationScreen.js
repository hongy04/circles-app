import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '../../components/Avatar';
import { MonoRingWithRipples } from '../../components/MonoRingWithRipples';
import { COLORS } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import {
  claimEventGuestAttendance,
  getEventGuestAttendeeList,
  previewEventGuestInvite,
  respondToEventGuestInvite,
} from '../../services/eventGuestInviteService';
import {
  fetchMyEditableProfile,
  isProfileIdentityComplete,
} from '../../services/profileService';

const RSVP_OPTIONS = [
  { status: 'going', label: 'Going', icon: 'checkmark-circle-outline' },
  { status: 'maybe', label: 'Maybe', icon: 'help-circle-outline' },
  { status: 'not_going', label: 'Can’t go', icon: 'close-circle-outline' },
];

const STATUS_LABELS = {
  invited: 'No response yet',
  going: 'Going',
  maybe: 'Maybe',
  not_going: 'Can’t go',
};

function unavailableMessage(reason) {
  switch (reason) {
    case 'expired':
      return 'This private invitation link has expired. Ask the person who invited you for a new one.';
    case 'revoked':
      return 'This private invitation link has been replaced or revoked.';
    case 'event_unavailable':
      return 'This event is no longer accepting guest RSVPs.';
    case 'disabled':
      return 'Guest RSVPs are temporarily unavailable.';
    default:
      return 'This invitation could not be found or is no longer available.';
  }
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
  if (start.toDateString() === end.toDateString()) {
    return `${date} · ${startTime}–${endTime}`;
  }

  return `${date} at ${startTime} – ${end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} at ${endTime}`;
}

function DetailRow({ icon, children }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={20} color={COLORS.text} />
      </View>
      <Text style={styles.detailText}>{children}</Text>
    </View>
  );
}

function attendeeMeta(attendee) {
  if (attendee.isHost) return 'Host';
  if (attendee.attendeeType === 'member') return 'Circle member';

  const typeLabel = attendee.guestType === 'plus_one' ? 'Plus-one' : 'Guest';
  return attendee.invitedByName
    ? `${typeLabel} · invited by ${attendee.invitedByName}`
    : typeLabel;
}

function AttendeeRow({ attendee }) {
  return (
    <View style={styles.attendeeRow}>
      <Avatar
        size={42}
        name={attendee.displayName}
        uri={attendee.avatarUri}
      />
      <View style={styles.attendeeCopy}>
        <Text style={styles.attendeeName}>{attendee.displayName}</Text>
        <Text style={styles.attendeeMeta}>{attendeeMeta(attendee)}</Text>
      </View>
    </View>
  );
}

function accountClaimCopy(state) {
  switch (state) {
    case 'available':
      return {
        title: 'Keep this event in Circles',
        body: 'Join or sign in to link your confirmed attendance. You can then see the limited profiles of people who were there and choose whether to connect.',
      };
    case 'attendance_pending':
      return {
        title: 'Attendance review pending',
        body: 'After the host confirms who attended, return to this private link to keep the event in Circles.',
      };
    case 'not_attended':
      return {
        title: 'Attendance was not confirmed',
        body: 'This invitation cannot create shared-event access because the host did not mark this guest as attended.',
      };
    case 'already_claimed':
      return {
        title: 'Already linked to Circles',
        body: 'This guest attendance has already been claimed by a Circles account.',
      };
    case 'rsvp_required':
      return {
        title: 'Submit your RSVP first',
        body: 'Enter your name and RSVP before this invitation can later be linked to a Circles account.',
      };
    default:
      return null;
  }
}

function GuestPhotoViewer({ photo, onClose }) {
  if (!photo) return null;

  return (
    <Modal
      visible={Boolean(photo)}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.photoViewerScreen}>
        <View style={styles.photoViewerHeader}>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.photoViewerClose, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={27} color="#fff" />
          </Pressable>
        </View>
        <Image
          source={{ uri: photo.url }}
          resizeMode="contain"
          style={styles.photoViewerImage}
        />
        <View style={styles.photoViewerFooter}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#d8d8d8" />
          <Text style={styles.photoViewerFooterText}>
            Shared privately for this event. This image does not open a Circles profile.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function EventGuestInvitationScreen({ route, navigation }) {
  const token = route.params?.token || '';
  const [preview, setPreview] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [claimingAccount, setClaimingAccount] = useState(false);
  const [claimError, setClaimError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextPreview = await previewEventGuestInvite(token);
      setPreview(nextPreview);
      if (nextPreview?.valid) {
        setDisplayName(nextPreview.guest.displayName || '');
        setSelectedStatus(
          ['going', 'maybe', 'not_going'].includes(nextPreview.guest.status)
            ? nextPreview.guest.status
            : ''
        );
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this invitation.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const saveRsvp = async () => {
    if (!preview?.valid || saving || preview.rsvpLocked) return;
    const cleanName = displayName.trim();

    if (!cleanName) {
      setError('Enter your name before saving your RSVP.');
      return;
    }
    if (!selectedStatus) {
      setError('Choose Going, Maybe, or Can’t go.');
      return;
    }

    setSaving(true);
    setError('');
    setSavedMessage('');

    try {
      const response = await respondToEventGuestInvite(token, {
        displayName: cleanName,
        status: selectedStatus,
      });
      setDisplayName(response.displayName);

      try {
        setPreview(await previewEventGuestInvite(token));
      } catch {
        let attendeeList = preview.attendeeList;
        try {
          attendeeList = await getEventGuestAttendeeList(token);
        } catch {
          // The RSVP is already saved. Keep the existing attendee state if the
          // optional list cannot refresh right away.
        }

        setPreview((current) => ({
          ...current,
          guest: {
            ...current.guest,
            displayName: response.displayName,
            status: response.status,
            claimed: true,
          },
          invitation: {
            ...current.invitation,
            claimRequired: false,
          },
          attendeeList,
        }));
      }
      setSavedMessage(`Your RSVP is saved as ${STATUS_LABELS[response.status] || 'updated'}.`);
    } catch (responseError) {
      setError(responseError?.message || 'Could not save your RSVP.');
    } finally {
      setSaving(false);
    }
  };

  const useAnotherAccountForClaim = async () => {
    setClaimingAccount(true);
    setClaimError('');

    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      navigation.replace('Auth', { eventGuestToken: token });
    } catch (switchError) {
      setClaimError(switchError?.message || 'Could not switch Circles accounts.');
    } finally {
      setClaimingAccount(false);
    }
  };

  const openClaimedEvent = (result) => {
    navigation.replace('ClaimedEventConnections', {
      eventId: result.eventId,
      eventTitle: result.eventTitle,
    });
  };

  const showExistingMemberChoice = (result) => {
    Alert.alert(
      'This account is already part of the event',
      'The Circles account currently signed in already has a member record for this event, so it cannot also claim the outside-guest identity. Open the event with this account, or sign in with the guest’s own account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use another account', onPress: useAnotherAccountForClaim },
        { text: 'Open event', onPress: () => openClaimedEvent(result) },
      ]
    );
  };

  const claimAttendanceInCircles = async () => {
    if (!token || claimingAccount) return;
    setClaimingAccount(true);
    setClaimError('');

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (!session) {
        navigation.replace('Auth', { eventGuestToken: token });
        return;
      }

      const currentProfile = await fetchMyEditableProfile();
      if (!isProfileIdentityComplete(currentProfile)) {
        navigation.replace('GuestClaimProfileSetup', {
          eventGuestToken: token,
        });
        return;
      }

      const result = await claimEventGuestAttendance(token);
      if (result.outcome === 'member_attendee') {
        showExistingMemberChoice(result);
        return;
      }

      openClaimedEvent(result);
    } catch (claimFailure) {
      setClaimError(claimFailure?.message || 'Could not link this event to Circles.');
    } finally {
      setClaimingAccount(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Opening event invitation…</Text>
      </SafeAreaView>
    );
  }

  if (!preview?.valid) {
    return (
      <SafeAreaView style={styles.centered}>
        <View style={styles.unavailableIcon}>
          <Ionicons name="calendar-outline" size={30} color={COLORS.text} />
        </View>
        <Text style={styles.unavailableTitle}>Invitation unavailable</Text>
        <Text style={styles.unavailableBody}>
          {error || unavailableMessage(preview?.reason)}
        </Text>
        <Pressable onPress={load} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const { event, guest, invitation, attendeeList, photoGallery } = preview;
  const claimContent = accountClaimCopy(preview.accountClaim?.state);
  const greeting = guest.claimed && guest.displayName
    ? `${guest.displayName}, you’re invited`
    : 'You’re invited';

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandBlock}>
            <MonoRingWithRipples size={74} />
            <Text style={styles.eyebrow}>PRIVATE EVENT INVITATION</Text>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.title}>{event.title}</Text>

            <View style={styles.hostRow}>
              <Avatar size={46} name={event.hostName} uri={event.hostAvatar} />
              <View style={styles.hostCopy}>
                <Text style={styles.hostName}>{event.hostName}</Text>
                <Text style={styles.hostMeta}>Host · invited by {invitation.invitedByName}</Text>
              </View>
            </View>

            <DetailRow icon="calendar-outline">
              {formatEventDate(event.startsAt, event.endsAt)}
            </DetailRow>

            {event.locationName ? (
              <DetailRow icon="location-outline">{event.locationName}</DetailRow>
            ) : null}

            {event.description ? (
              <Text style={styles.description}>{event.description}</Text>
            ) : null}
          </View>

          <View style={styles.rsvpCard}>
            <Text style={styles.rsvpTitle}>
              {preview.rsvpLocked
                ? 'Event completed'
                : guest.claimed
                  ? 'Update your RSVP'
                  : 'Claim your invitation'}
            </Text>
            <Text style={styles.rsvpBody}>
              {preview.rsvpLocked
                ? `RSVPs are closed. Your saved response is ${STATUS_LABELS[guest.status] || 'available in the event history'}.`
                : 'Enter your own name and choose a response. No Circles account is required.'}
            </Text>

            <Text style={styles.inputLabel}>Your name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Maya Chen"
              placeholderTextColor="#a4a4a4"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={80}
              editable={!preview.rsvpLocked}
              style={[styles.nameInput, preview.rsvpLocked && styles.inputLocked]}
            />

            <Text style={styles.inputLabel}>Can you make it?</Text>
            <View style={styles.rsvpButtons}>
              {RSVP_OPTIONS.map((option) => {
                const selected = selectedStatus === option.status;
                return (
                  <Pressable
                    key={option.status}
                    onPress={() => setSelectedStatus(option.status)}
                    disabled={saving || preview.rsvpLocked}
                    style={({ pressed }) => [
                      styles.rsvpButton,
                      selected && styles.rsvpButtonSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={selected ? '#fff' : COLORS.text}
                    />
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

            {selectedStatus === 'going' && !preview.rsvpLocked ? (
              <View style={styles.visibilityNotice}>
                <Ionicons name="eye-outline" size={17} color={COLORS.text} />
                <Text style={styles.visibilityNoticeText}>
                  {attendeeList?.visible
                    ? 'Your name will appear in Who’s going to people with a valid guest invitation. Your Circles profile stays private.'
                    : 'Your name is currently hidden from other guests. If the host enables the attendee list later, it may appear in Who’s going.'}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={saveRsvp}
              disabled={saving || preview.rsvpLocked}
              style={({ pressed }) => [
                styles.saveButton,
                preview.rsvpLocked && styles.saveButtonLocked,
                (pressed || saving) && styles.pressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {preview.rsvpLocked
                    ? 'RSVPs closed'
                    : guest.claimed
                      ? 'Save RSVP'
                      : 'Submit RSVP'}
                </Text>
              )}
            </Pressable>

            {savedMessage ? <Text style={styles.successText}>{savedMessage}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          {attendeeList?.valid ? (
            <View style={styles.attendeesCard}>
              <View style={styles.attendeesHeader}>
                <View>
                  <Text style={styles.attendeesTitle}>
                    {attendeeList.completed ? 'Who was there' : 'Who’s going'}
                  </Text>
                  <Text style={styles.attendeesCount}>
                    {attendeeList.goingCount === 1
                      ? attendeeList.completed ? '1 person attended' : '1 person going'
                      : attendeeList.completed
                        ? `${attendeeList.goingCount} people attended`
                        : `${attendeeList.goingCount} people going`}
                  </Text>
                </View>
                <Ionicons name="people-outline" size={22} color={COLORS.text} />
              </View>

              {attendeeList.visible ? (
                attendeeList.attendees.length > 0 ? (
                  <View style={styles.attendeeList}>
                    {attendeeList.attendees.map((attendee, index) => (
                      <AttendeeRow
                        key={`${attendee.attendeeType}-${attendee.displayName}-${index}`}
                        attendee={attendee}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.attendeesEmpty}>
                    {attendeeList.completed ? 'No attendance was confirmed.' : 'No one is marked Going yet.'}
                  </Text>
                )
              ) : (
                <View style={styles.attendeesHidden}>
                  <Ionicons name="eye-off-outline" size={19} color={COLORS.subtext} />
                  <Text style={styles.attendeesHiddenText}>
                    The host chose to keep attendee names private for this event.
                  </Text>
                </View>
              )}

              <Text style={styles.attendeesPrivacy}>
                Attendee rows are informational only. Private profiles and Circle details cannot be opened from this page.
              </Text>
            </View>
          ) : null}

          {photoGallery?.valid ? (
            <View style={styles.photosCard}>
              <View style={styles.photosHeader}>
                <View>
                  <Text style={styles.photosTitle}>Event photos</Text>
                  <Text style={styles.photosCount}>
                    {photoGallery.photoCount === 1
                      ? '1 photo shared'
                      : `${photoGallery.photoCount} photos shared`}
                  </Text>
                </View>
                <Ionicons name="images-outline" size={23} color={COLORS.text} />
              </View>

              {photoGallery.photos.length > 0 ? (
                <View style={styles.photoGrid}>
                  {photoGallery.photos.map((photo) => (
                    <Pressable
                      key={photo.id}
                      onPress={() => setSelectedPhoto(photo)}
                      style={({ pressed }) => [
                        styles.photoTile,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Image source={{ uri: photo.url }} style={styles.photoTileImage} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={styles.photosEmpty}>
                  <Ionicons name="image-outline" size={28} color={COLORS.subtext} />
                  <Text style={styles.photosEmptyTitle}>No photos shared yet</Text>
                  <Text style={styles.photosEmptyBody}>
                    Photos added by attendees will appear here through this private invitation.
                  </Text>
                </View>
              )}

              <Text style={styles.photosPrivacy}>
                Event photos are view-only here. They do not reveal private Circle names, profiles, posts, messages, or connections.
              </Text>
            </View>
          ) : null}

          {claimContent ? (
            <View style={styles.claimCard}>
              <View style={styles.claimIcon}>
                <Ionicons name="people-circle-outline" size={26} color={COLORS.text} />
              </View>
              <View style={styles.claimCopy}>
                <Text style={styles.claimTitle}>{claimContent.title}</Text>
                <Text style={styles.claimBody}>{claimContent.body}</Text>

                {['available', 'already_claimed'].includes(preview.accountClaim?.state) ? (
                  <Pressable
                    onPress={claimAttendanceInCircles}
                    disabled={claimingAccount}
                    style={({ pressed }) => [
                      styles.claimButton,
                      (pressed || claimingAccount) && styles.pressed,
                    ]}
                  >
                    {claimingAccount ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.claimButtonText}>
                        {preview.accountClaim?.state === 'already_claimed'
                          ? 'Open this event in Circles'
                          : 'Join Circles and keep this event'}
                      </Text>
                    )}
                  </Pressable>
                ) : null}

                {claimError ? <Text style={styles.claimError}>{claimError}</Text> : null}
                <Text style={styles.claimPrivacy}>
                  Claiming creates shared-event context only. It does not join a Circle, reveal private profiles, or connect you automatically.
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.privacyCard}>
            <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.text} />
            <View style={styles.privacyCopy}>
              <Text style={styles.privacyTitle}>Your link is private</Text>
              <Text style={styles.privacyBody}>
                It does not reveal private Circles, profiles, posts, messages, or connections. Avoid forwarding it because one link represents one reserved guest spot.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <GuestPhotoViewer
        photo={selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  keyboardView: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  unavailableIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#f1f1f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableTitle: {
    marginTop: 18,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 23,
    textAlign: 'center',
  },
  unavailableBody: {
    maxWidth: 480,
    marginTop: 9,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    padding: 18,
    paddingBottom: 46,
  },
  brandBlock: { alignItems: 'center', paddingTop: 10, paddingBottom: 18 },
  eyebrow: {
    marginTop: 18,
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  heroCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  greeting: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  title: {
    marginTop: 7,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 27,
    lineHeight: 33,
  },
  hostRow: {
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hostCopy: { flex: 1, marginLeft: 11 },
  hostName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  hostMeta: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 15 },
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
    padding: 19,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  rsvpTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  rsvpBody: {
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  inputLabel: {
    marginTop: 18,
    marginBottom: 8,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  inputLocked: { opacity: 0.65 },
  nameInput: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f7f7f7',
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
  },
  rsvpButtons: { flexDirection: 'row', gap: 7 },
  rsvpButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f1f1f1',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  rsvpButtonSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rsvpButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
  rsvpButtonTextSelected: { color: '#fff' },
  saveButton: {
    minHeight: 50,
    marginTop: 18,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonLocked: { backgroundColor: '#9a9a9a' },
  saveButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  successText: {
    marginTop: 10,
    color: '#19733a',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 10,
    color: '#a61b12',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    textAlign: 'center',
  },
  visibilityNotice: {
    marginTop: 12,
    padding: 12,
    borderRadius: 11,
    backgroundColor: '#f1f1f1',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  visibilityNoticeText: {
    flex: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  attendeesCard: {
    marginTop: 12,
    padding: 19,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  attendeesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  attendeesTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  attendeesCount: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  attendeeList: { marginTop: 14 },
  attendeeRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  attendeeCopy: { flex: 1, marginLeft: 11 },
  attendeeName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  attendeeMeta: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  attendeesEmpty: {
    marginTop: 14,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  attendeesHidden: {
    marginTop: 14,
    padding: 13,
    borderRadius: 12,
    backgroundColor: '#f1f1f1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  attendeesHiddenText: {
    flex: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  attendeesPrivacy: {
    marginTop: 12,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  photosCard: {
    marginTop: 12,
    padding: 18,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  photosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photosTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  photosCount: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  photoGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  photoTile: {
    width: '48.5%',
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: '#e8e8e8',
  },
  photoTileImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photosEmpty: {
    marginTop: 14,
    padding: 22,
    borderRadius: 14,
    backgroundColor: '#f4f4f4',
    alignItems: 'center',
  },
  photosEmptyTitle: {
    marginTop: 8,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  photosEmptyBody: {
    maxWidth: 360,
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  photosPrivacy: {
    marginTop: 13,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  photoViewerScreen: { flex: 1, backgroundColor: '#000' },
  photoViewerHeader: {
    minHeight: 58,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  photoViewerClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerImage: { flex: 1, width: '100%' },
  photoViewerFooter: {
    minHeight: 70,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  photoViewerFooterText: {
    flex: 1,
    color: '#d8d8d8',
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  claimCard: {
    marginTop: 12,
    padding: 17,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    gap: 12,
  },
  claimIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
  },
  claimCopy: { flex: 1 },
  claimTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  claimBody: {
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  claimButton: {
    minHeight: 48,
    marginTop: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  claimButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    textAlign: 'center',
  },
  claimError: {
    marginTop: 9,
    color: '#a61b12',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    lineHeight: 16,
  },
  claimPrivacy: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  privacyCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 15,
    backgroundColor: '#eeeeee',
    flexDirection: 'row',
    gap: 11,
  },
  privacyCopy: { flex: 1 },
  privacyTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  privacyBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  pressed: { opacity: 0.72 },
});
