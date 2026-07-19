import { supabase } from '../lib/supabase';
import { timeAgo } from '../utils/timeAgo';

export function mapFeedRow(row) {
  return {
    id: row.id,
    user: {
      name: row.author_name || 'Unknown',
      avatarUri: row.author_avatar || null,
    },
    uri: row.image_url,
    liked: Boolean(row.liked_by_me),
    likes: Number(row.likes_count || 0),
    caption: row.caption || '',
    time: timeAgo(row.created_at),
    created_at: row.created_at,
  };
}

export async function fetchFeedPage({
  limit = 10,
  before = new Date().toISOString(),
} = {}) {
  const { data, error } = await supabase.rpc('get_feed', {
    limit_count: limit,
    before,
  });

  if (error) throw error;

  const posts = (data || []).map(mapFeedRow);

  return {
    posts,
    cursor: posts.length
      ? posts[posts.length - 1].created_at
      : null,
  };
}

export async function fetchPostComments(postId) {
  const { data: rows, error: commentsError } = await supabase
    .from('post_comments')
    .select('id, body, created_at, user_id, post_id')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (commentsError) throw commentsError;

  const userIds = Array.from(
    new Set((rows || []).map((row) => row.user_id).filter(Boolean))
  );

  let usersById = new Map();

  if (userIds.length) {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, display_name, avatar_url')
      .in('id', userIds);

    if (usersError) throw usersError;

    usersById = new Map(
      (users || []).map((user) => [user.id, user])
    );
  }

  return (rows || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName:
      usersById.get(row.user_id)?.display_name || 'Someone',
    avatarUri:
      usersById.get(row.user_id)?.avatar_url || null,
    text: row.body,
    createdAt: row.created_at,
    pending: false,
  }));
}

export async function addPostComment(postId, body) {
  const { data, error } = await supabase.rpc('add_comment', {
    p_post_id: postId,
    p_body: body,
  });

  if (error) throw error;
  return data;
}

export async function togglePostLike(postId) {
  const { data, error } = await supabase.rpc('toggle_like', {
    p_post_id: postId,
  });

  if (error) throw error;
  return data;
}
