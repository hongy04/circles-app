import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import {
  createConversationMediaSignedUrl,
  hydrateConversationMediaItems,
  removeConversationMedia,
} from './conversationMediaService';


let realtimeSubscriptionCounter = 0;

function createRealtimeChannelName(prefix, scope = 'inbox') {
  realtimeSubscriptionCounter += 1;
  return `${prefix}_${scope}_${Date.now()}_${realtimeSubscriptionCounter}`;
}

function mapConversation(row) {
  return {
    id: row.conversation_id,
    kind: row.kind,
    title: row.display_title || 'Conversation',
    avatarUri: row.display_avatar || null,
    avatarPath: row.display_avatar_path || null,
    otherUserId: row.other_user_id || null,
    isCircle: row.is_circle == null
      ? row.kind === 'group'
      : Boolean(row.is_circle),
    lastMessage: row.last_message || null,
    lastMessageAt: row.last_message_at || null,
    unreadCount: Number(row.unread_count || 0),
    pinned: Boolean(row.is_pinned),
    memberCount: Number(row.member_count || 0),
    pendingInvitationCount: Number(row.pending_invitation_count || 0),
    createdAt: row.created_at,
  };
}

function mapInvitation(row) {
  return {
    id: row.invitation_id,
    conversationId: row.conversation_id,
    title: row.title || 'Private group',
    inviterId: row.inviter_id,
    inviterName: row.inviter_name || 'A connection',
    inviterAvatar: row.inviter_avatar || null,
    memberCount: Number(row.invited_member_count || 0),
    createdAt: row.created_at,
  };
}

function mapMedia(row) {
  return {
    id: row.id || row.media_id,
    messageId: row.message_id || null,
    storagePath: row.storage_path,
    mediaType: row.media_type,
    width: Number(row.width || 0) || null,
    height: Number(row.height || 0) || null,
    durationMs: Number(row.duration_ms || 0) || null,
    sortOrder: Number(row.sort_order || 0),
    senderId: row.sender_id || null,
    senderName: row.sender_name || null,
    senderAvatar: row.sender_avatar || null,
    messageBody: row.message_body || null,
    createdAt: row.created_at || null,
  };
}

function mapMessage(row) {
  return {
    id: row.message_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name || 'Member',
    senderAvatar: row.sender_avatar || null,
    body: row.body || '',
    media: (row.media || []).map(mapMedia),
    createdAt: row.created_at,
    readCount: Number(row.read_count || 0),
    recipientCount: Number(row.recipient_count || 0),
  };
}

function mapMessageReadState(row) {
  return {
    messageId: row.message_id,
    readCount: Number(row.read_count || 0),
    recipientCount: Number(row.recipient_count || 0),
  };
}

async function hydrateMessages(messages) {
  const flatMedia = messages.flatMap((message) =>
    message.media.map((item) => ({ ...item, messageId: message.id }))
  );
  const hydrated = await hydrateConversationMediaItems(flatMedia);
  const byMessage = new Map();

  hydrated.forEach((item) => {
    const current = byMessage.get(item.messageId) || [];
    current.push(item);
    byMessage.set(item.messageId, current);
  });

  return messages.map((message) => ({
    ...message,
    media: (byMessage.get(message.id) || [])
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

async function hydrateConversationAvatar(conversation) {
  if (!conversation.avatarPath) return conversation;

  try {
    const signed = await createConversationMediaSignedUrl(
      conversation.avatarPath
    );
    return {
      ...conversation,
      avatarUri: signed || conversation.avatarUri,
    };
  } catch {
    return conversation;
  }
}

export async function getCurrentConversationUser() {
  const { user } = await ensureAuthed();
  return user;
}

export async function listMyConversations() {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_my_conversations');
  if (error) throw error;

  return Promise.all((data || []).map((row) =>
    hydrateConversationAvatar(mapConversation(row))
  ));
}

export async function listConversationInvitations() {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'get_my_conversation_invitations'
  );
  if (error) throw error;
  return (data || []).map(mapInvitation);
}

export async function respondToConversationInvitation(invitationId, action) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'respond_conversation_invitation',
    {
      p_invitation_id: invitationId,
      p_action: action,
    }
  );
  if (error) throw error;
  return data;
}

export async function listConnectedPeopleForGroup() {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'get_connected_people_for_group'
  );
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.user_id,
    displayName: row.display_name || 'Connection',
    avatarUri: row.avatar_url || null,
  }));
}

export async function createGroupConversation({ title, inviteeIds }) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('create_group_conversation', {
    p_title: title?.trim() || null,
    p_invitee_ids: inviteeIds,
  });
  if (error) throw error;
  return data;
}

export async function listConversationMessages(conversationId) {
  await ensureAuthed();

  const [{ data: messageRows, error: messageError }, {
    data: readRows,
    error: readError,
  }] = await Promise.all([
    supabase.rpc('get_conversation_messages', {
      p_conversation_id: conversationId,
      p_limit_count: 100,
      p_before: new Date().toISOString(),
    }),
    supabase.rpc('get_conversation_message_read_states', {
      p_conversation_id: conversationId,
    }),
  ]);

  if (messageError) throw messageError;
  if (readError) throw readError;

  const readStates = new Map(
    (readRows || []).map((row) => {
      const state = mapMessageReadState(row);
      return [state.messageId, state];
    })
  );

  const mapped = (messageRows || []).map((row) => {
    const message = mapMessage(row);
    const state = readStates.get(message.id);

    return state
      ? {
        ...message,
        readCount: state.readCount,
        recipientCount: state.recipientCount,
      }
      : message;
  });

  return hydrateMessages(mapped);
}

export async function sendConversationMessage(
  conversationId,
  body,
  mediaItems = []
) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'send_conversation_message_with_media',
    {
      p_conversation_id: conversationId,
      p_body: body?.trim() || null,
      p_media: mediaItems.map((item) => ({
        storage_path: item.storagePath,
        media_type: item.mediaType,
        width: item.width || null,
        height: item.height || null,
        duration_ms: item.durationMs || null,
      })),
    }
  );

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The message was sent, but no message row returned.');

  const [message] = await hydrateMessages([mapMessage(row)]);
  return message;
}

export async function deleteOwnConversationMessage(messageId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'delete_own_conversation_message',
    { p_message_id: messageId }
  );

  if (error) throw error;
  const paths = data?.storage_paths || [];

  try {
    await removeConversationMedia(paths);
  } catch {
    // The database deletion is authoritative. A later cleanup can remove an
    // orphaned private object without exposing it to the Timeline or chat.
  }

  return {
    conversationId: data?.conversation_id || null,
    storagePaths: paths,
  };
}

export async function markConversationRead(conversationId) {
  await ensureAuthed();
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

export async function toggleConversationPin(conversationId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('toggle_conversation_pin', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function getConversationDetails(conversationId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_conversation_details', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;

  const result = data || null;
  const avatarPath = result?.conversation?.avatar_path;

  if (result?.conversation && avatarPath) {
    try {
      result.conversation.avatar_url =
        await createConversationMediaSignedUrl(avatarPath);
    } catch {
      // The profile still works with initials if the signed URL cannot load.
    }
  }

  return result;
}

export async function listConversationTimeline(conversationId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_conversation_timeline', {
    p_conversation_id: conversationId,
    p_limit_count: 120,
    p_before: new Date().toISOString(),
  });

  if (error) throw error;
  return hydrateConversationMediaItems((data || []).map(mapMedia));
}

export async function updateGroupCircleProfile({
  conversationId,
  title,
  bio,
  avatarPath,
}) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'update_group_circle_profile',
    {
      p_conversation_id: conversationId,
      p_title: title,
      p_bio: bio || null,
      p_avatar_path: avatarPath || null,
    }
  );

  if (error) throw error;
  return data;
}

export function subscribeToConversationChanges({
  conversationId,
  onMessage,
  onConversationChange,
  onMediaChange,
}) {
  const channels = [];

  if (conversationId && (onMessage || onMediaChange)) {
    const messageChannel = supabase
      .channel(createRealtimeChannelName('conversation_messages', conversationId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        onMessage || onMediaChange
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_media',
        },
        onMediaChange || onMessage
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_message_reads',
        },
        onMessage || onMediaChange
      )
      .subscribe();
    channels.push(messageChannel);
  }

  if (onConversationChange) {
    const membershipChannel = supabase
      .channel(
        createRealtimeChannelName(
          'conversation_membership',
          conversationId || 'inbox'
        )
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members' },
        onConversationChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_invitations' },
        onConversationChange
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        onConversationChange
      )
      .subscribe();
    channels.push(membershipChannel);
  }

  return () => {
    channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
  };
}
