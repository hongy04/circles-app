import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { trackAppEvent } from './analyticsService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';

function mapEventSummary(row) {
  return {
    id: row.event_id,
    title: row.title || 'Event',
    description: row.description || '',
    startsAt: row.starts_at,
    endsAt: row.ends_at || null,
    locationName: row.location_name || '',
    status: row.event_status || 'scheduled',
    hostId: row.host_id,
    hostName: row.host_name || 'Circle member',
    hostAvatar: row.host_avatar || null,
    viewerRsvpStatus: row.viewer_rsvp_status || 'pending',
    attendeeCount: Number(row.attendee_count || 0),
    goingCount: Number(row.going_count || 0),
    maybeCount: Number(row.maybe_count || 0),
    notGoingCount: Number(row.not_going_count || 0),
    pendingCount: Number(row.pending_count || 0),
    circleCount: Math.max(1, Number(row.circle_count || 1)),
    guestCount: Number(row.guest_count || 0),
    guestCap: Number(row.outside_guest_cap || 0),
  };
}

function mapEventDetails(data) {
  const rawEvent = data?.event || {};
  const counts = data?.counts || {};

  return {
    event: {
      id: rawEvent.id,
      title: rawEvent.title || 'Event',
      description: rawEvent.description || '',
      startsAt: rawEvent.starts_at,
      endsAt: rawEvent.ends_at || null,
      locationName: rawEvent.location_name || '',
      status: rawEvent.status || 'scheduled',
      hostId: rawEvent.host_id,
      hostName: rawEvent.host_name || 'Circle member',
      hostAvatar: rawEvent.host_avatar || null,
      circleId: rawEvent.circle_id,
      circleName: rawEvent.circle_name || 'Circle',
      circleCount: Math.max(1, Number(rawEvent.circle_count || 1)),
      circles: (rawEvent.circles || []).map((circle) => ({
        id: circle.conversation_id,
        name: circle.name || 'Circle',
      })),
      viewerRsvpStatus: rawEvent.viewer_rsvp_status || 'pending',
      canManage: Boolean(rawEvent.can_manage),
      outsideGuestCap: Number(rawEvent.outside_guest_cap || 0),
      membersCanInviteGuests: Boolean(rawEvent.members_can_invite_guests),
      allowPlusOnes: Boolean(rawEvent.allow_plus_ones),
      guestCount: Number(rawEvent.guest_count || 0),
      remainingGuestSlots: Number(rawEvent.remaining_guest_slots || 0),
      canAddGuests: Boolean(rawEvent.can_add_guests),
      createdAt: rawEvent.created_at || null,
    },
    counts: {
      attendeeCount: Number(counts.attendee_count || 0),
      going: Number(counts.going || 0),
      maybe: Number(counts.maybe || 0),
      notGoing: Number(counts.not_going || 0),
      pending: Number(counts.pending || 0),
      guestCount: Number(counts.guest_count || 0),
      guestGoing: Number(counts.guest_going || 0),
      guestMaybe: Number(counts.guest_maybe || 0),
      guestInvited: Number(counts.guest_invited || 0),
      guestNotGoing: Number(counts.guest_not_going || 0),
    },
    attendees: (data?.attendees || []).map((attendee) => ({
      userId: attendee.user_id,
      displayName: attendee.display_name || 'Circle member',
      avatarUri: attendee.avatar_url || null,
      rsvpStatus: attendee.rsvp_status || 'pending',
      respondedAt: attendee.responded_at || null,
      isHost: Boolean(attendee.is_host),
      isMe: Boolean(attendee.is_me),
    })),
    guests: (data?.guests || []).map((guest) => ({
      id: guest.id,
      displayName: guest.display_name || 'Guest',
      guestType: guest.guest_type || 'guest',
      status: guest.status || 'invited',
      respondedAt: guest.responded_at || null,
      invitedByName: guest.invited_by_name || 'Circle member',
      canManage: Boolean(guest.can_manage),
    })),
  };
}

export async function listCircleEvents(conversationId) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.CIRCLE_EVENTS,
    'Circle events are temporarily unavailable.'
  );

  if (!conversationId) throw new Error('Circle is missing.');

  const { data, error } = await supabase.rpc('list_circle_events', {
    p_conversation_id: conversationId,
  });

  if (error) throw error;
  return (data || []).map(mapEventSummary);
}

export async function createCircleEvent({
  conversationId,
  conversationIds,
  title,
  description = '',
  startsAt,
  endsAt = null,
  locationName = '',
  outsideGuestCap = 0,
  membersCanInviteGuests = false,
  allowPlusOnes = false,
}) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.CIRCLE_EVENTS,
    'Creating Circle events is temporarily unavailable.'
  );

  const selectedConversationIds = Array.from(new Set(
    (Array.isArray(conversationIds) ? conversationIds : [conversationId])
      .filter(Boolean)
  ));

  if (selectedConversationIds.length === 0) throw new Error('Circle is missing.');
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    throw new Error('Event start time is invalid.');
  }
  if (endsAt && (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime()))) {
    throw new Error('Event end time is invalid.');
  }

  let data;
  let error;

  if (selectedConversationIds.length > 1) {
    await requireFeature(
      FEATURE_FLAGS.MULTI_CIRCLE_EVENTS,
      'Multi-Circle events are temporarily unavailable.'
    );

    ({ data, error } = await supabase.rpc('create_multi_circle_event', {
      p_conversation_ids: selectedConversationIds,
      p_title: String(title || '').trim(),
      p_description: String(description || '').trim(),
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt ? endsAt.toISOString() : null,
      p_location_name: String(locationName || '').trim(),
      p_outside_guest_cap: Number(outsideGuestCap || 0),
      p_members_can_invite_guests: Boolean(membersCanInviteGuests),
      p_allow_plus_ones: Boolean(allowPlusOnes),
    }));
  } else {
    ({ data, error } = await supabase.rpc('create_circle_event', {
      p_conversation_id: selectedConversationIds[0],
      p_title: String(title || '').trim(),
      p_description: String(description || '').trim(),
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt ? endsAt.toISOString() : null,
      p_location_name: String(locationName || '').trim(),
      p_outside_guest_cap: Number(outsideGuestCap || 0),
      p_members_can_invite_guests: Boolean(membersCanInviteGuests),
      p_allow_plus_ones: Boolean(allowPlusOnes),
    }));
  }

  if (error) throw error;
  if (!data?.event_id) throw new Error('Circles could not create the event.');

  void trackAppEvent('event_created', {
    surface: 'create_event',
    has_location: Boolean(String(locationName || '').trim()),
    has_description: Boolean(String(description || '').trim()),
    circle_count: selectedConversationIds.length,
    guest_cap: Number(outsideGuestCap || 0),
    invite_mode: membersCanInviteGuests ? 'members' : 'host_only',
    allow_plus_ones: Boolean(allowPlusOnes),
  });

  return data.event_id;
}

export async function getEventDetails(eventId) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.CIRCLE_EVENTS,
    'Circle events are temporarily unavailable.'
  );

  if (!eventId) throw new Error('Event is missing.');

  const { data, error } = await supabase.rpc('get_event_details', {
    p_event_id: eventId,
  });

  if (error) throw error;
  if (!data?.event?.id) throw new Error('Event not found or unavailable.');
  return mapEventDetails(data);
}

export async function respondToEvent(eventId, status) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.CIRCLE_EVENTS,
    'Circle events are temporarily unavailable.'
  );

  if (!['going', 'maybe', 'not_going'].includes(status)) {
    throw new Error('Choose Going, Maybe, or Can’t go.');
  }

  const { data, error } = await supabase.rpc('respond_to_event', {
    p_event_id: eventId,
    p_status: status,
  });

  if (error) throw error;

  void trackAppEvent('event_rsvp_updated', {
    surface: 'event_detail',
    rsvp_status: data?.status || status,
  });

  return data?.status || status;
}

export async function addEventGuest({
  eventId,
  displayName,
  guestType = 'guest',
  status = 'invited',
}) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_OUTSIDE_GUESTS,
    'Outside guests are temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc('add_event_guest', {
    p_event_id: eventId,
    p_display_name: String(displayName || '').trim(),
    p_guest_type: guestType,
    p_status: status,
  });

  if (error) throw error;

  return data;
}

export async function updateEventGuestResponse(guestId, status) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_OUTSIDE_GUESTS,
    'Outside guests are temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc('update_event_guest_response', {
    p_guest_id: guestId,
    p_status: status,
  });

  if (error) throw error;

  return data?.status || status;
}

export async function removeEventGuest(guestId, guestType = 'guest') {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_OUTSIDE_GUESTS,
    'Outside guests are temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc('remove_event_guest', {
    p_guest_id: guestId,
  });

  if (error) throw error;

  return Boolean(data);
}

export async function updateEventGuestSettings({
  eventId,
  outsideGuestCap,
  membersCanInviteGuests,
  allowPlusOnes,
}) {
  await ensureAuthed();
  await requireFeature(
    FEATURE_FLAGS.EVENT_OUTSIDE_GUESTS,
    'Outside guests are temporarily unavailable.'
  );

  const { data, error } = await supabase.rpc('update_event_guest_settings', {
    p_event_id: eventId,
    p_outside_guest_cap: Number(outsideGuestCap || 0),
    p_members_can_invite_guests: Boolean(membersCanInviteGuests),
    p_allow_plus_ones: Boolean(allowPlusOnes),
  });

  if (error) throw error;

  return data;
}

