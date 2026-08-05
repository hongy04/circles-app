import { Platform, Share } from 'react-native';
import * as Linking from 'expo-linking';

import {
  EVENT_GUEST_BASE_URL,
  INVITE_BASE_URL,
} from '../config/env';
import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';

function cleanBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function configuredGuestBaseUrl() {
  const directBase = cleanBaseUrl(EVENT_GUEST_BASE_URL);
  if (directBase) return directBase;

  const inviteBase = cleanBaseUrl(INVITE_BASE_URL);
  if (!inviteBase) return '';

  try {
    const parsed = new URL(inviteBase);
    return `${parsed.protocol}//${parsed.host}/event-guest`;
  } catch {
    return '';
  }
}

export function buildEventGuestInviteUrl(token) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) throw new Error('Guest invitation token is missing.');

  const baseUrl = configuredGuestBaseUrl();
  if (baseUrl) return `${baseUrl}/${encodeURIComponent(cleanToken)}`;

  return Linking.createURL(`event-guest/${encodeURIComponent(cleanToken)}`);
}

function mapPreview(data) {
  const rawGuest = data?.guest || {};
  const rawEvent = data?.event || {};
  const rawInvitation = data?.invitation || {};

  return {
    valid: Boolean(data?.valid),
    reason: data?.reason || null,
    guest: {
      displayName: rawGuest.display_name || '',
      guestType: rawGuest.guest_type || 'guest',
      status: rawGuest.status || 'invited',
      claimed: Boolean(rawGuest.claimed),
    },
    event: {
      title: rawEvent.title || 'Event',
      description: rawEvent.description || '',
      startsAt: rawEvent.starts_at || null,
      endsAt: rawEvent.ends_at || null,
      locationName: rawEvent.location_name || '',
      hostName: rawEvent.host_name || 'Event host',
      hostAvatar: rawEvent.host_avatar || null,
      status: rawEvent.status || 'scheduled',
      attendanceReviewed: Boolean(rawEvent.attendance_reviewed),
      appearanceKey: rawEvent.appearance_key || 'circle',
      coverUrl: null,
    },
    invitation: {
      invitedByName: rawInvitation.invited_by_name || 'A Circle member',
      expiresAt: rawInvitation.expires_at || null,
      claimRequired: Boolean(rawInvitation.claim_required),
    },
    accountClaim: {
      state: data?.account_claim?.state || 'unavailable',
      available: Boolean(data?.account_claim?.available),
    },
    rsvpLocked: Boolean(data?.rsvp_locked),
  };
}

function mapAttendeeList(data) {
  return {
    valid: Boolean(data?.valid),
    reason: data?.reason || null,
    visible: Boolean(data?.visible),
    goingCount: Number(data?.going_count || 0),
    completed: Boolean(data?.completed),
    attendees: (data?.attendees || []).map((attendee) => ({
      displayName: attendee.display_name || 'Attendee',
      avatarUri: attendee.avatar_url || null,
      attendeeType: attendee.attendee_type || 'member',
      guestType: attendee.guest_type || null,
      isHost: Boolean(attendee.is_host),
      invitedByName: attendee.invited_by_name || '',
    })),
  };
}

function mapPhotoGallery(data) {
  return {
    valid: Boolean(data?.valid),
    reason: data?.reason || null,
    galleryEnabled: data?.gallery_enabled !== false,
    appearanceKey: data?.appearance_key || 'circle',
    coverUrl: data?.cover_signed_url || data?.coverSignedUrl || null,
    photoCount: Number(data?.photo_count || 0),
    expiresIn: Number(data?.expires_in || 0) || null,
    photos: (data?.photos || []).map((photo, index) => ({
      id: photo.id || `event-photo-${index}`,
      url: photo.signed_url || photo.signedUrl || photo.url || null,
      width: Number(photo.width || 0) || null,
      height: Number(photo.height || 0) || null,
      createdAt: photo.created_at || null,
    })).filter((photo) => Boolean(photo.url)),
  };
}

function mapAccountClaimPreview(data) {
  const rawGuest = data?.guest || {};
  const rawEvent = data?.event || {};
  const rawInvitation = data?.invitation || {};
  const rawClaim = data?.account_claim || {};

  return {
    valid: Boolean(data?.valid),
    reason: data?.reason || null,
    guest: {
      displayName: rawGuest.display_name || '',
      guestType: rawGuest.guest_type || 'guest',
      status: rawGuest.status || 'invited',
      claimed: Boolean(rawGuest.claimed),
      accountClaimed: Boolean(rawGuest.account_claimed),
    },
    event: {
      title: rawEvent.title || 'Event',
      description: rawEvent.description || '',
      startsAt: rawEvent.starts_at || null,
      endsAt: rawEvent.ends_at || null,
      locationName: rawEvent.location_name || '',
      hostName: rawEvent.host_name || 'Event host',
      hostAvatar: rawEvent.host_avatar || null,
      status: rawEvent.status || 'scheduled',
      attendanceReviewed: Boolean(rawEvent.attendance_reviewed),
      appearanceKey: rawEvent.appearance_key || 'circle',
      coverUrl: null,
    },
    invitation: {
      invitedByName: rawInvitation.invited_by_name || 'A Circle member',
      expiresAt: rawInvitation.expires_at || null,
      claimRequired: Boolean(rawInvitation.claim_required),
    },
    accountClaim: {
      state: rawClaim.state || 'unavailable',
      available: Boolean(rawClaim.available),
    },
    rsvpLocked: Boolean(data?.rsvp_locked),
  };
}

function mapCreatedInvitation(data) {
  if (!data?.token) throw new Error('Circles could not create the guest invitation.');

  return {
    invitationId: data.invitation_id || null,
    token: data.token,
    url: buildEventGuestInviteUrl(data.token),
    expiresAt: data.expires_at || null,
    guestType: data.guest_type || 'guest',
  };
}

export async function shareCreatedEventGuestInvitation({ invite, eventTitle }) {
  const cleanEventTitle = String(eventTitle || 'an event').trim() || 'an event';
  const typeLabel = invite.guestType === 'plus_one' ? 'plus-one invitation' : 'guest invitation';
  const message = `You’re invited to ${cleanEventTitle} through Circles. Open this private ${typeLabel} to enter your name and RSVP without creating an account.\n\n${invite.url}`;

  const response = await Share.share(
    {
      title: `RSVP to ${cleanEventTitle}`,
      message,
      ...(Platform.OS === 'ios' ? { url: invite.url } : {}),
    },
    { subject: `RSVP to ${cleanEventTitle}` }
  );

  return {
    ...invite,
    shareResult: response?.action || 'unknown',
  };
}

export async function createEventGuestInvitation({ eventId, guestType = 'guest' }) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_GUEST_WEB_RSVP,
    'Guest invitation links are temporarily unavailable.'
  );

  if (!eventId) throw new Error('Event is missing.');

  const { data, error } = await supabase.rpc('create_event_guest_invitation', {
    p_event_id: eventId,
    p_guest_type: guestType,
  });

  if (error) throw error;
  return mapCreatedInvitation(data);
}

export async function createAndShareEventGuestInvitation({
  eventId,
  guestType = 'guest',
  eventTitle,
}) {
  const invite = await createEventGuestInvitation({ eventId, guestType });
  return shareCreatedEventGuestInvitation({ invite, eventTitle });
}

export async function rotateEventGuestInvitation(invitationId) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_GUEST_WEB_RSVP,
    'Guest invitation links are temporarily unavailable.'
  );

  if (!invitationId) throw new Error('Guest invitation is missing.');

  const { data, error } = await supabase.rpc('rotate_event_guest_invitation', {
    p_invitation_id: invitationId,
  });

  if (error) throw error;
  return mapCreatedInvitation(data);
}

export async function reshareEventGuestInvitation({ invitationId, eventTitle }) {
  const invite = await rotateEventGuestInvitation(invitationId);
  return shareCreatedEventGuestInvitation({ invite, eventTitle });
}

export async function revokeEventGuestInvitation(invitationId) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_GUEST_WEB_RSVP,
    'Guest invitation links are temporarily unavailable.'
  );

  if (!invitationId) throw new Error('Guest invitation is missing.');

  const { data, error } = await supabase.rpc('revoke_event_guest_invitation', {
    p_invitation_id: invitationId,
  });

  if (error) throw error;
  return Boolean(data);
}

// Legacy helpers remain for already-created named guests and previously shared
// links. The current UI no longer creates guest records before a recipient
// claims an invitation.
export async function createEventGuestInvite(guestId) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_GUEST_WEB_RSVP,
    'Guest invitation links are temporarily unavailable.'
  );

  if (!guestId) throw new Error('Guest is missing.');

  const { data, error } = await supabase.rpc('create_event_guest_invite', {
    p_guest_id: guestId,
  });

  if (error) throw error;
  if (!data?.token) throw new Error('Circles could not create the guest invitation.');

  return {
    token: data.token,
    url: buildEventGuestInviteUrl(data.token),
    expiresAt: data.expires_at || null,
    guestType: data.guest_type || 'guest',
    guestStatus: data.guest_status || 'invited',
  };
}

export async function shareEventGuestInvite({ guestId, guestName, eventTitle }) {
  const invite = await createEventGuestInvite(guestId);
  const cleanGuestName = String(guestName || 'Guest').trim() || 'Guest';
  const cleanEventTitle = String(eventTitle || 'an event').trim() || 'an event';
  const message = `${cleanGuestName}, you’re invited to ${cleanEventTitle} through Circles. You can view the event and RSVP without creating an account.\n\n${invite.url}`;

  const response = await Share.share(
    {
      title: `RSVP to ${cleanEventTitle}`,
      message,
      ...(Platform.OS === 'ios' ? { url: invite.url } : {}),
    },
    { subject: `RSVP to ${cleanEventTitle}` }
  );

  return {
    ...invite,
    shareResult: response?.action || 'unknown',
  };
}

export async function getEventGuestPhotoGallery(token) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return mapPhotoGallery({ valid: false, reason: 'not_found' });

  const { data, error } = await supabase.functions.invoke('event-photo-access', {
    body: { token: cleanToken },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return mapPhotoGallery(data);
}

export async function getEventGuestAttendeeList(token) {
  const { data, error } = await supabase.rpc('list_event_guest_attendees', {
    p_token: String(token || '').trim(),
  });

  if (error) throw error;
  return mapAttendeeList(data);
}

export async function previewEventGuestInvite(token) {
  const cleanToken = String(token || '').trim();
  const settle = (promise) => promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason })
  );

  // All private-link reads begin together. The attendee/gallery calls validate
  // the same token independently, so there is no reason to make the guest wait
  // through a second network round-trip just to reveal the event cover.
  const [inviteResult, claimResult, attendeeResult, photoResult] = await Promise.all([
    supabase.rpc('preview_event_guest_invite', { p_token: cleanToken }),
    supabase.rpc('preview_event_guest_account_claim', { p_token: cleanToken }),
    settle(getEventGuestAttendeeList(cleanToken)),
    settle(getEventGuestPhotoGallery(cleanToken)),
  ]);

  if (inviteResult.error) throw inviteResult.error;
  if (claimResult.error) throw claimResult.error;

  const invitePreview = mapPreview(inviteResult.data);
  const claimPreview = mapAccountClaimPreview(claimResult.data);
  const preview = invitePreview.valid
    ? claimPreview.valid
      ? {
          ...invitePreview,
          accountClaim: claimPreview.accountClaim,
          rsvpLocked: claimPreview.rsvpLocked,
          event: { ...invitePreview.event, ...claimPreview.event },
          guest: { ...invitePreview.guest, accountClaimed: claimPreview.guest.accountClaimed },
        }
      : invitePreview
    : claimPreview.valid
      ? claimPreview
      : invitePreview;

  if (!preview.valid) {
    return {
      ...preview,
      attendeeList: mapAttendeeList(null),
      photoGallery: mapPhotoGallery(null),
    };
  }

  const attendeeList = attendeeResult.status === 'fulfilled'
    ? attendeeResult.value
    : { ...mapAttendeeList(null), reason: 'unavailable' };
  const photoGallery = photoResult.status === 'fulfilled'
    ? photoResult.value
    : { ...mapPhotoGallery(null), reason: 'unavailable' };

  return {
    ...preview,
    event: {
      ...preview.event,
      appearanceKey: photoGallery.appearanceKey || preview.event?.appearanceKey || 'circle',
      coverUrl: photoGallery.coverUrl || null,
    },
    attendeeList,
    photoGallery,
  };
}

export async function claimEventGuestAttendance(token) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.GUEST_ATTENDANCE_CLAIMS,
    'Guest attendance claiming is temporarily unavailable.'
  );

  const cleanToken = String(token || '').trim();
  if (!cleanToken) throw new Error('Guest invitation token is missing.');

  const { data, error } = await supabase.rpc('claim_event_guest_attendance', {
    p_token: cleanToken,
  });

  if (error) throw error;
  if (!data?.event_id) throw new Error('Circles could not claim this event.');

  return {
    outcome: data.outcome || 'claimed',
    eventId: data.event_id,
    eventTitle: data.event_title || 'Event',
    startsAt: data.starts_at || null,
    attendanceReviewedAt: data.attendance_reviewed_at || null,
  };
}

export async function respondToEventGuestInvite(token, { displayName, status }) {
  if (!['going', 'maybe', 'not_going'].includes(status)) {
    throw new Error('Choose Going, Maybe, or Can’t go.');
  }

  const cleanName = String(displayName || '').trim();
  if (!cleanName) throw new Error('Enter your name before saving your RSVP.');

  const { data, error } = await supabase.rpc('respond_to_event_guest_invite', {
    p_token: String(token || '').trim(),
    p_display_name: cleanName,
    p_status: status,
  });

  if (error) throw error;
  return {
    status: data?.status || status,
    displayName: data?.display_name || cleanName,
    claimed: Boolean(data?.claimed),
  };
}
