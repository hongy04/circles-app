import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';

let notificationRealtimeCounter = 0;

function nextChannelName(scope = 'notifications') {
  notificationRealtimeCounter += 1;
  return `${scope}_${Date.now()}_${notificationRealtimeCounter}`;
}

function mapNotification(row) {
  const circlePostId = row.circle_post_id || row.post_id || null;
  const circleCommentId = row.circle_comment_id || row.comment_id || null;
  const personalPostId = row.personal_post_id || null;
  const personalCommentId = row.personal_comment_id || null;

  return {
    id: row.notification_id,
    type: row.notification_type,
    conversationId: row.conversation_id || null,
    conversationTitle: row.conversation_title || null,
    actorId: row.actor_id || null,
    actorName: row.actor_name || 'Someone',
    actorAvatar: row.actor_avatar || null,
    circlePostId,
    circleCommentId,
    personalPostId,
    personalCommentId,
    postId: personalPostId || circlePostId,
    commentId: personalCommentId || circleCommentId,
    invitationId: row.invitation_id || null,
    createdAt: row.created_at,
    readAt: row.read_at || null,
    isRead: Boolean(row.is_read),
  };
}

function mapSettings(data) {
  return {
    conversationId: data?.conversation_id || null,
    kind: data?.kind || 'direct',
    isCircle: Boolean(data?.is_circle),
    title: data?.title || 'Conversation',
    muted: Boolean(data?.is_muted),
    mutedUntil: data?.muted_until || null,
    mutedForever: Boolean(data?.muted_forever),
    notifyMessages: data?.notify_messages !== false,
    notifyCirclePosts: data?.notify_circle_posts !== false,
    notifyCircleInteractions: data?.notify_circle_interactions !== false,
  };
}

export async function listNotifications() {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_my_notifications', {
    p_limit_count: 150,
    p_before: new Date().toISOString(),
  });
  if (error) throw error;
  return (data || []).map(mapNotification);
}

// Compatibility alias for any older screen that still imports the Step 9E name.
export const listCircleNotifications = listNotifications;

export async function getNotificationBadgeCount() {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'get_my_notification_badge_count'
  );
  if (error) throw error;
  return Number(data || 0);
}

export async function getNotificationCenterUnreadCount() {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'get_my_notification_unread_count'
  );
  if (error) throw error;
  return Number(data || 0);
}

export async function markNotificationRead(notificationId) {
  await ensureAuthed();
  const { error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export const markCircleNotificationRead = markNotificationRead;

export async function markAllNotificationsRead() {
  await ensureAuthed();
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
}

export const markAllCircleNotificationsRead = markAllNotificationsRead;

export async function getConversationNotificationSettings(conversationId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'get_conversation_notification_settings',
    { p_conversation_id: conversationId }
  );
  if (error) throw error;
  return mapSettings(data);
}

export async function setConversationMute(conversationId, duration) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('set_conversation_mute', {
    p_conversation_id: conversationId,
    p_duration: duration,
  });
  if (error) throw error;
  return mapSettings(data);
}

export async function updateConversationNotificationPreferences(
  conversationId,
  preferences
) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc(
    'update_conversation_notification_preferences',
    {
      p_conversation_id: conversationId,
      p_notify_messages: Boolean(preferences.notifyMessages),
      p_notify_circle_posts: Boolean(preferences.notifyCirclePosts),
      p_notify_circle_interactions: Boolean(
        preferences.notifyCircleInteractions
      ),
    }
  );
  if (error) throw error;
  return mapSettings(data);
}

export function subscribeToNotificationChanges(onChange) {
  if (!onChange) return () => {};

  // Personal-post triggers and Circle triggers both write into the same private
  // activity table. Listening here gives the app one universal live stream.
  const channel = supabase
    .channel(nextChannelName())
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'circle_notifications' },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages' },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversation_members' },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversation_invitations' },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
