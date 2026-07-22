import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import {
  hydrateConversationMediaItems,
  removeConversationMedia,
} from './conversationMediaService';

let circlePostRealtimeCounter = 0;

function realtimeChannelName(scope = 'circle-posts') {
  circlePostRealtimeCounter += 1;
  return `${scope}_${Date.now()}_${circlePostRealtimeCounter}`;
}

function mapMedia(row) {
  return {
    id: row.id,
    storagePath: row.storage_path,
    mediaType: row.media_type,
    width: Number(row.width || 0) || null,
    height: Number(row.height || 0) || null,
    durationMs: Number(row.duration_ms || 0) || null,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at || null,
  };
}

function mapPost(row) {
  return {
    id: row.post_id,
    conversationId: row.conversation_id,
    authorId: row.author_id,
    authorName: row.author_name || 'Circle member',
    authorAvatar: row.author_avatar || null,
    caption: row.caption || '',
    media: (row.media || []).map(mapMedia),
    commentCount: Number(row.comment_count || 0),
    canEdit: Boolean(row.can_edit),
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
  };
}

function mapComment(row) {
  return {
    id: row.comment_id,
    postId: row.post_id,
    userId: row.user_id,
    displayName: row.display_name || 'Circle member',
    avatarUri: row.avatar_url || null,
    body: row.body || '',
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
    canDelete: Boolean(row.can_delete),
  };
}

async function hydratePost(post) {
  const media = await hydrateConversationMediaItems(post.media || []);
  return {
    ...post,
    media: media.sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export async function listCirclePosts(conversationId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_circle_posts', {
    p_conversation_id: conversationId,
    p_limit_count: 60,
    p_before: new Date().toISOString(),
  });
  if (error) throw error;

  return Promise.all((data || []).map((row) => hydratePost(mapPost(row))));
}

export async function getCirclePost(postId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_circle_post', {
    p_post_id: postId,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('This Circle post is unavailable.');
  return hydratePost(mapPost(row));
}

export async function createCirclePost({
  conversationId,
  caption,
  mediaItems,
}) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('create_circle_post', {
    p_conversation_id: conversationId,
    p_caption: caption?.trim() || null,
    p_media: (mediaItems || []).map((item) => ({
      storage_path: item.storagePath,
      media_type: item.mediaType,
      width: item.width || null,
      height: item.height || null,
      duration_ms: item.durationMs || null,
    })),
  });
  if (error) throw error;
  return data;
}

export async function listCirclePostComments(postId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('get_circle_post_comments', {
    p_post_id: postId,
    p_limit_count: 200,
    p_before: new Date().toISOString(),
  });
  if (error) throw error;
  return (data || []).map(mapComment);
}

export async function addCirclePostComment(postId, body) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('add_circle_post_comment', {
    p_post_id: postId,
    p_body: body.trim(),
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The comment was not returned.');
  return mapComment(row);
}

export async function deleteOwnCirclePostComment(commentId) {
  await ensureAuthed();
  const { error } = await supabase.rpc('delete_own_circle_post_comment', {
    p_comment_id: commentId,
  });
  if (error) throw error;
}

export async function updateOwnCirclePostCaption(postId, caption) {
  await ensureAuthed();
  const { error } = await supabase.rpc('update_own_circle_post_caption', {
    p_post_id: postId,
    p_caption: caption?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteOwnCirclePost(postId) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('delete_own_circle_post', {
    p_post_id: postId,
  });
  if (error) throw error;

  const paths = data?.storage_paths || [];
  try {
    await removeConversationMedia(paths);
  } catch {
    // The private database post is already gone. A later storage cleanup can
    // remove an orphaned object without making it visible to the Circle.
  }

  return {
    conversationId: data?.conversation_id || null,
    storagePaths: paths,
  };
}

export function subscribeToCirclePostChanges({
  conversationId,
  postId,
  onChange,
}) {
  if (!onChange) return () => {};

  const channel = supabase
    .channel(realtimeChannelName(`circle_posts_${conversationId || postId || 'all'}`))
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversation_posts',
        ...(conversationId
          ? { filter: `conversation_id=eq.${conversationId}` }
          : {}),
      },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversation_post_media' },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversation_post_comments' },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
