import { supabase } from '../lib/supabase';
import { timeAgo } from '../utils/timeAgo';

function fallbackMedia(row) {
  if (!row.image_url) return [];

  return [
    {
      id: `primary-${row.id}`,
      post_id: row.id,
      url: row.image_url,
      media_type: /\.(mp4|mov|m4v)(?:$|\?)/i.test(row.image_url)
        ? 'video'
        : 'image',
      created_at: row.created_at,
    },
  ];
}

export function mapFeedRow(row, enrichment = {}) {
  const media = enrichment.mediaByPost?.get(row.id) || fallbackMedia(row);
  const authorId = enrichment.authorByPost?.get(row.id) || null;

  return {
    id: row.id,
    user: {
      id: authorId,
      name: row.author_name || 'Unknown',
      avatarUri: row.author_avatar || null,
    },
    media,
    uri: media[0]?.url || row.image_url || null,
    liked: Boolean(row.liked_by_me),
    likes: Number(row.likes_count || 0),
    commentCount: enrichment.commentCountByPost?.get(row.id) || 0,
    caption: row.caption || '',
    time: timeAgo(row.created_at),
    created_at: row.created_at,
  };
}

async function fetchFeedEnrichment(postIds) {
  const mediaByPost = new Map();
  const authorByPost = new Map();
  const commentCountByPost = new Map();

  if (!postIds.length) {
    return { mediaByPost, authorByPost, commentCountByPost };
  }

  const [postResult, mediaResult, commentsResult] = await Promise.all([
    supabase.from('posts').select('id, user_id').in('id', postIds),
    supabase
      .from('post_media')
      .select('id, post_id, url, media_type, created_at')
      .in('post_id', postIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('post_comments')
      .select('post_id')
      .in('post_id', postIds),
  ]);

  if (!postResult.error) {
    (postResult.data || []).forEach((post) => {
      authorByPost.set(post.id, post.user_id);
    });
  }

  if (!mediaResult.error) {
    (mediaResult.data || []).forEach((item) => {
      const current = mediaByPost.get(item.post_id) || [];
      current.push(item);
      mediaByPost.set(item.post_id, current);
    });
  }

  if (!commentsResult.error) {
    (commentsResult.data || []).forEach((comment) => {
      commentCountByPost.set(
        comment.post_id,
        (commentCountByPost.get(comment.post_id) || 0) + 1
      );
    });
  }

  return { mediaByPost, authorByPost, commentCountByPost };
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

  const rows = data || [];
  const enrichment = await fetchFeedEnrichment(
    rows.map((row) => row.id)
  );
  const posts = rows.map((row) => mapFeedRow(row, enrichment));

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
