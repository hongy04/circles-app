import { supabase } from '../lib/supabase';
import { timeAgo } from '../utils/timeAgo';
import { hydrateConversationMediaItems } from './conversationMediaService';
import {
  addCirclePostComment,
  listCirclePostComments,
  toggleCirclePostLike,
} from './circlePostService';

let unifiedFeedAvailable = true;
let optimizedFeedAvailable = true;

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

function normalizeMedia(media, row) {
  if (!Array.isArray(media) || media.length === 0) {
    return fallbackMedia(row);
  }

  return media.map((item, index) => ({
    id: item.id || `${row.id}-media-${index}`,
    post_id: item.post_id || row.id,
    url: item.url || null,
    media_type: item.media_type || 'image',
    created_at: item.created_at || row.created_at,
  })).filter((item) => item.url);
}

function normalizeCircleFeedMedia(media, row) {
  if (!Array.isArray(media) || media.length === 0) return [];

  return media.map((item, index) => ({
    id: item.id || `${row.id}-media-${index}`,
    post_id: item.post_id || row.id,
    url: item.url || null,
    storagePath: item.storage_path || item.storagePath || null,
    media_type: item.media_type || 'image',
    width: Number(item.width || 0) || null,
    height: Number(item.height || 0) || null,
    durationMs: Number(item.duration_ms || item.durationMs || 0) || null,
    sortOrder: Number(item.sort_order ?? item.sortOrder ?? index),
    created_at: item.created_at || row.created_at,
  }));
}

function baseFeedShape({
  row,
  sourceType,
  media,
  authorId,
  commentCount,
  canEdit,
  circle,
}) {
  return {
    id: row.id,
    feedKey: `${sourceType}:${row.id}`,
    sourceType,
    user: {
      id: authorId,
      name: row.author_name || 'Unknown',
      avatarUri: row.author_avatar || null,
    },
    circle: circle || null,
    media,
    presentation: {
      mediaPresentations: Array.isArray(row.media_presentations) ? row.media_presentations : [],
      aspectRatio: row.display_aspect_ratio == null ? null : Number(row.display_aspect_ratio),
      cropPoints: Array.isArray(row.media_crop_points) ? row.media_crop_points : [],
    },
    uri: media[0]?.url || row.image_url || null,
    liked: Boolean(row.liked_by_me),
    likes: Number(row.likes_count || 0),
    commentCount: Number(commentCount ?? row.comment_count ?? 0),
    caption: row.caption || '',
    time: timeAgo(row.created_at),
    created_at: row.created_at,
    canEdit: Boolean(canEdit),
  };
}

export function mapFeedRow(row, enrichment = {}) {
  const media = enrichment.mediaByPost?.get(row.id) || fallbackMedia(row);
  const postMeta = enrichment.postMetaByPost?.get(row.id) || {};
  const authorId = postMeta.user_id || row.user_id || null;

  return baseFeedShape({
    row,
    sourceType: 'personal',
    media,
    authorId,
    commentCount: enrichment.commentCountByPost?.get(row.id),
    canEdit: false,
    circle: null,
  });
}

function mapOptimizedFeedRow(row) {
  const media = normalizeMedia(row.media, row);

  return baseFeedShape({
    row,
    sourceType: 'personal',
    media,
    authorId: row.user_id || null,
    canEdit: false,
    circle: null,
  });
}

function mapUnifiedFeedRow(row) {
  const sourceType = row.source_type === 'circle' ? 'circle' : 'personal';
  const media = sourceType === 'circle'
    ? normalizeCircleFeedMedia(row.media, row)
    : normalizeMedia(row.media, row);

  return baseFeedShape({
    row,
    sourceType,
    media,
    authorId: row.user_id || null,
    canEdit: Boolean(row.can_edit),
    circle: sourceType === 'circle'
      ? {
          id: row.circle_id || null,
          name: row.circle_name || 'Circle',
          avatarUri: row.circle_avatar || null,
        }
      : null,
  });
}

async function hydrateUnifiedCircleMedia(posts) {
  const circleMedia = posts.flatMap((post) => (
    post.sourceType === 'circle'
      ? (post.media || [])
        .filter((item) => item.storagePath)
        .map((item) => ({ ...item, feedKey: post.feedKey }))
      : []
  ));

  if (!circleMedia.length) return posts;

  const hydrated = await hydrateConversationMediaItems(circleMedia);
  const byFeedKey = new Map();

  hydrated.forEach((item) => {
    const current = byFeedKey.get(item.feedKey) || [];
    current.push(item);
    byFeedKey.set(item.feedKey, current);
  });

  return posts.map((post) => {
    if (post.sourceType !== 'circle') return post;
    const hydratedMedia = byFeedKey.get(post.feedKey);
    if (!hydratedMedia) return post;
    const media = hydratedMedia
      .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
    return {
      ...post,
      media,
      uri: media[0]?.url || null,
    };
  });
}

function isMissingFunctionError(error, functionName) {
  return error?.code === 'PGRST202'
    || new RegExp(functionName, 'i').test(error?.message || '');
}

async function fetchFeedEnrichment(postIds) {
  const mediaByPost = new Map();
  const postMetaByPost = new Map();
  const commentCountByPost = new Map();

  if (!postIds.length) {
    return { mediaByPost, postMetaByPost, commentCountByPost };
  }

  const [postResult, mediaResult, commentsResult] = await Promise.all([
    supabase.from('posts').select('id, user_id, display_aspect_ratio, media_crop_points, media_presentations').in('id', postIds),
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
      postMetaByPost.set(post.id, post);
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

  return { mediaByPost, postMetaByPost, commentCountByPost };
}

async function fetchLegacyFeedPage({ limit, before }) {
  const { data, error } = await supabase.rpc('get_feed', {
    limit_count: limit,
    before,
  });

  if (error) throw error;

  const rows = data || [];
  const enrichment = await fetchFeedEnrichment(
    rows.map((row) => row.id)
  );

  return rows.map((row) => mapFeedRow(row, enrichment));
}

async function fetchPersonalFeedPage({ limit, before }) {
  let posts = null;

  if (optimizedFeedAvailable) {
    const { data, error } = await supabase.rpc('get_feed_v2', {
      limit_count: limit,
      before,
    });

    if (!error) {
      posts = (data || []).map(mapOptimizedFeedRow);
    } else if (isMissingFunctionError(error, 'get_feed_v2')) {
      optimizedFeedAvailable = false;
    } else {
      throw error;
    }
  }

  if (!posts) {
    posts = await fetchLegacyFeedPage({ limit, before });
  }

  return posts;
}

export async function fetchFeedPage({
  limit = 10,
  before = new Date().toISOString(),
} = {}) {
  let posts = null;

  if (unifiedFeedAvailable) {
    const { data, error } = await supabase.rpc('get_feed_v3', {
      limit_count: limit,
      before,
    });

    if (!error) {
      posts = await hydrateUnifiedCircleMedia((data || []).map(mapUnifiedFeedRow));
    } else if (isMissingFunctionError(error, 'get_feed_v3')) {
      unifiedFeedAvailable = false;
    } else {
      throw error;
    }
  }

  if (!posts) {
    posts = await fetchPersonalFeedPage({ limit, before });
  }

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

export async function fetchFeedComments(post) {
  if (post?.sourceType !== 'circle') {
    return fetchPostComments(post?.id);
  }

  const rows = await listCirclePostComments(post.id);
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId || null,
    userName: row.displayName || 'Circle member',
    avatarUri: row.avatarUri || null,
    text: row.body || '',
    createdAt: row.createdAt,
    pending: false,
  }));
}

export async function addFeedComment(post, body) {
  if (post?.sourceType !== 'circle') {
    return addPostComment(post?.id, body);
  }
  return addCirclePostComment(post.id, body);
}

export async function toggleFeedLike(post) {
  if (post?.sourceType !== 'circle') {
    await togglePostLike(post?.id);
    return null;
  }
  return toggleCirclePostLike(post.id);
}
