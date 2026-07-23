import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { createConversationMediaSignedUrl } from './conversationMediaService';

function mapMember(row) {
  return {
    userId: row.user_id,
    displayName: row.display_name || 'Member',
    avatarUri: row.avatar_url || null,
    role: row.role || 'member',
    joinedAt: row.joined_at || null,
    isMe: Boolean(row.is_me),
  };
}

function mapPendingInvitation(row) {
  return {
    id: row.invitation_id,
    userId: row.user_id,
    displayName: row.display_name || 'Connection',
    avatarUri: row.avatar_url || null,
    invitedBy: row.invited_by || null,
    invitedByName: row.invited_by_name || 'A Circle manager',
    createdAt: row.created_at || null,
  };
}

export async function getCirclePeople(conversationId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_circle_people', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;

  const raw = data || {};
  const conversation = raw.conversation || {};
  let avatarUri = conversation.avatar_url || null;

  if (conversation.avatar_path) {
    try {
      avatarUri = await createConversationMediaSignedUrl(
        conversation.avatar_path
      );
    } catch {
      // Initials remain available when a private avatar cannot be signed.
    }
  }

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title || 'Circle',
      avatarUri,
      memberCount: Number(conversation.member_count || 0),
      pendingCount: Number(conversation.pending_count || 0),
    },
    viewerRole: raw.viewer_role || 'member',
    permissions: {
      canInvite: Boolean(raw.permissions?.can_invite),
      canCancelInvitations: Boolean(
        raw.permissions?.can_cancel_invitations
      ),
      canManageRoles: Boolean(raw.permissions?.can_manage_roles),
      canRemoveMembers: Boolean(raw.permissions?.can_remove_members),
      canLeave: Boolean(raw.permissions?.can_leave),
    },
    members: (raw.members || []).map(mapMember),
    pendingInvitations: (raw.pending_invitations || []).map(
      mapPendingInvitation
    ),
  };
}

export async function listCircleInviteCandidates(conversationId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'get_circle_invite_candidates',
    { p_conversation_id: conversationId }
  );
  if (error) throw error;

  return (data || []).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name || 'Connection',
    avatarUri: row.avatar_url || null,
  }));
}

export async function invitePeopleToCircle(conversationId, userIds) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('invite_people_to_circle', {
    p_conversation_id: conversationId,
    p_user_ids: userIds,
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function cancelCircleInvitation(invitationId) {
  await ensureAuthed();
  const { error } = await supabase.rpc('cancel_circle_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw error;
}

export async function updateCircleMemberRole(
  conversationId,
  userId,
  role
) {
  await ensureAuthed();
  const { error } = await supabase.rpc('update_circle_member_role', {
    p_conversation_id: conversationId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}

export async function transferCircleOwnership(conversationId, userId) {
  await ensureAuthed();
  const { error } = await supabase.rpc('transfer_circle_ownership', {
    p_conversation_id: conversationId,
    p_new_owner_id: userId,
  });
  if (error) throw error;
}

export async function removeCircleMember(conversationId, userId) {
  await ensureAuthed();
  const { error } = await supabase.rpc('remove_circle_member', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function leaveCircle(conversationId) {
  await ensureAuthed();
  const { error } = await supabase.rpc('leave_circle', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}
