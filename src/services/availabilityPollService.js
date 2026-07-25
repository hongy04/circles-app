import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { trackAppEvent } from './analyticsService';
import { FEATURE_FLAGS, requireFeature } from './featureFlagService';

async function requireAvailabilityPolls(message) {
  await requireFeature(
    FEATURE_FLAGS.CIRCLE_EVENTS,
    'Circle events are temporarily unavailable.'
  );
  await requireFeature(
    FEATURE_FLAGS.EVENT_AVAILABILITY_POLLS,
    message || 'Availability polls are temporarily unavailable.'
  );
}

function mapPollSummary(row) {
  return {
    id: row.poll_id,
    title: row.title || 'Availability poll',
    description: row.description || '',
    locationName: row.location_name || '',
    status: row.poll_status || 'open',
    hostId: row.host_id,
    hostName: row.host_name || 'Circle member',
    hostAvatar: row.host_avatar || null,
    optionCount: Number(row.option_count || 0),
    responseCount: Number(row.response_count || 0),
    memberCount: Number(row.member_count || 0),
    viewerResponded: Boolean(row.viewer_responded),
    firstOptionStartsAt: row.first_option_starts_at || null,
    finalizedEventId: row.finalized_event_id || null,
    createdAt: row.created_at || null,
  };
}

function mapPollDetails(data) {
  const rawPoll = data?.poll || {};
  const rawCounts = data?.counts || {};

  return {
    poll: {
      id: rawPoll.id,
      title: rawPoll.title || 'Availability poll',
      description: rawPoll.description || '',
      locationName: rawPoll.location_name || '',
      status: rawPoll.status || 'open',
      circleId: rawPoll.circle_id,
      circleName: rawPoll.circle_name || 'Circle',
      hostId: rawPoll.host_id,
      hostName: rawPoll.host_name || 'Circle member',
      hostAvatar: rawPoll.host_avatar || null,
      canManage: Boolean(rawPoll.can_manage),
      viewerResponded: Boolean(rawPoll.viewer_responded),
      finalizedOptionId: rawPoll.finalized_option_id || null,
      finalizedEventId: rawPoll.finalized_event_id || null,
      finalizedAt: rawPoll.finalized_at || null,
      createdAt: rawPoll.created_at || null,
    },
    counts: {
      memberCount: Number(rawCounts.member_count || 0),
      responseCount: Number(rawCounts.response_count || 0),
      waitingCount: Number(rawCounts.waiting_count || 0),
    },
    options: (data?.options || []).map((option) => ({
      id: option.id,
      startsAt: option.starts_at,
      endsAt: option.ends_at || null,
      sortOrder: Number(option.sort_order || 0),
      availableCount: Number(option.available_count || 0),
      selectedByViewer: Boolean(option.selected_by_viewer),
      isFinalized: Boolean(option.is_finalized),
      availablePeople: (option.available_people || []).map((person) => ({
        userId: person.user_id,
        displayName: person.display_name || 'Circle member',
        avatarUri: person.avatar_url || null,
        isMe: Boolean(person.is_me),
      })),
    })),
    members: (data?.members || []).map((member) => ({
      userId: member.user_id,
      displayName: member.display_name || 'Circle member',
      avatarUri: member.avatar_url || null,
      respondedAt: member.responded_at || null,
      selectedCount: Number(member.selected_count || 0),
      isHost: Boolean(member.is_host),
      isMe: Boolean(member.is_me),
    })),
  };
}

export async function listCircleAvailabilityPolls(conversationId) {
  await ensureAuthed();
  await requireAvailabilityPolls();

  if (!conversationId) throw new Error('Circle is missing.');

  const { data, error } = await supabase.rpc('list_circle_event_polls', {
    p_conversation_id: conversationId,
  });

  if (error) throw error;
  return (data || []).map(mapPollSummary);
}

export async function createCircleAvailabilityPoll({
  conversationId,
  title,
  description = '',
  locationName = '',
  options,
}) {
  await ensureAuthed();
  await requireAvailabilityPolls('Creating availability polls is temporarily unavailable.');

  if (!conversationId) throw new Error('Circle is missing.');
  if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
    throw new Error('Choose between 2 and 6 possible times.');
  }

  const normalizedOptions = options.map((option) => {
    if (!(option?.startsAt instanceof Date) || Number.isNaN(option.startsAt.getTime())) {
      throw new Error('One of the proposed start times is invalid.');
    }
    if (
      option?.endsAt
      && (!(option.endsAt instanceof Date) || Number.isNaN(option.endsAt.getTime()))
    ) {
      throw new Error('One of the proposed end times is invalid.');
    }

    return {
      starts_at: option.startsAt.toISOString(),
      ends_at: option.endsAt ? option.endsAt.toISOString() : null,
    };
  });

  const { data, error } = await supabase.rpc('create_event_availability_poll', {
    p_conversation_id: conversationId,
    p_title: String(title || '').trim(),
    p_description: String(description || '').trim(),
    p_location_name: String(locationName || '').trim(),
    p_options: normalizedOptions,
  });

  if (error) throw error;
  if (!data?.poll_id) throw new Error('Circles could not create the availability poll.');

  void trackAppEvent('event_poll_created', {
    surface: 'create_event_poll',
    option_count: Number(data.option_count || normalizedOptions.length),
    has_location: Boolean(String(locationName || '').trim()),
    has_description: Boolean(String(description || '').trim()),
  });

  return data.poll_id;
}

export async function getAvailabilityPollDetails(pollId) {
  await ensureAuthed();
  await requireAvailabilityPolls();

  if (!pollId) throw new Error('Availability poll is missing.');

  const { data, error } = await supabase.rpc('get_event_availability_poll', {
    p_poll_id: pollId,
  });

  if (error) throw error;
  if (!data?.poll?.id) throw new Error('Availability poll not found or unavailable.');
  return mapPollDetails(data);
}

export async function respondToAvailabilityPoll(pollId, optionIds) {
  await ensureAuthed();
  await requireAvailabilityPolls();

  if (!pollId) throw new Error('Availability poll is missing.');
  if (!Array.isArray(optionIds)) throw new Error('Availability choices are invalid.');

  const uniqueOptionIds = [...new Set(optionIds.filter(Boolean))];
  const { data, error } = await supabase.rpc('respond_to_event_availability_poll', {
    p_poll_id: pollId,
    p_option_ids: uniqueOptionIds,
  });

  if (error) throw error;

  const selectedCount = Number(data?.selected_count || 0);
  void trackAppEvent('event_poll_response_updated', {
    surface: 'event_poll_detail',
    selected_count: selectedCount,
    none_available: Boolean(data?.none_available),
  });

  return {
    selectedCount,
    noneAvailable: Boolean(data?.none_available),
  };
}

export async function finalizeAvailabilityPoll(pollId, optionId) {
  await ensureAuthed();
  await requireAvailabilityPolls('Finalizing availability polls is temporarily unavailable.');

  if (!pollId || !optionId) throw new Error('Choose a proposed time to finalize.');

  const { data, error } = await supabase.rpc('finalize_event_availability_poll', {
    p_poll_id: pollId,
    p_option_id: optionId,
  });

  if (error) throw error;
  if (!data?.event_id) throw new Error('Circles could not finalize this event.');

  void trackAppEvent('event_poll_finalized', {
    surface: 'event_poll_detail',
    poll_status: 'finalized',
  });

  return data.event_id;
}
