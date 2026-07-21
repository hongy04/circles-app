import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';

function mapConversation(row) {
  return {
    id: row.conversation_id,
    kind: row.kind,
    title: row.display_title || 'Conversation',
    avatarUri: row.display_avatar || null,
    otherUserId: row.other_user_id || null,
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

function mapMessage(row) {
  return {
    id: row.message_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name || 'Member',
    senderAvatar: row.sender_avatar || null,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function getCurrentConversationUser() {
  const { user } = await ensureAuthed();
  return user;
}

export async function listMyConversations() {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_my_conversations');
  if (error) throw error;
  return (data || []).map(mapConversation);
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
  const { data, error } = await supabase.rpc('get_conversation_messages', {
    p_conversation_id: conversationId,
    p_limit_count: 100,
    p_before: new Date().toISOString(),
  });
  if (error) throw error;
  return (data || []).map(mapMessage);
}

export async function sendConversationMessage(conversationId, body) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('send_conversation_message', {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The message was sent, but no message row returned.');
  return mapMessage(row);
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
  return data || null;
}

export function subscribeToConversationChanges({
  conversationId,
  onMessage,
  onConversationChange,
}) {
  const channels = [];

  if (conversationId && onMessage) {
    const messageChannel = supabase
      .channel(`conversation_messages_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        onMessage
      )
      .subscribe();
    channels.push(messageChannel);
  }

  if (onConversationChange) {
    const membershipChannel = supabase
      .channel(`conversation_membership_${conversationId || 'inbox'}`)
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
      .subscribe();
    channels.push(membershipChannel);
  }

  return () => {
    channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
  };
}
