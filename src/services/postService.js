import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import {
  removeStorageUrls,
  uploadToBucket,
} from './uploadService';
import { validatePostAssets } from '../utils/mediaValidation';

const CAPTION_LIMIT = 2200;

function cleanCaption(value = '') {
  const caption = String(value).trim();

  if (caption.length > CAPTION_LIMIT) {
    throw new Error(`Caption must be ${CAPTION_LIMIT} characters or fewer.`);
  }

  return caption;
}

export async function createPostWithMedia({
  assets,
  caption,
  onProgress,
}) {
  const validationError = validatePostAssets(assets);
  if (validationError) throw new Error(validationError);

  const session = await ensureAuthed();
  const uploadedUrls = [];
  const types = [];

  try {
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];

      onProgress?.({
        stage: 'uploading',
        current: index + 1,
        total: assets.length,
      });

      const mediaType = asset.type === 'video' ? 'video' : 'image';
      const mimeType =
        asset.mimeType ||
        (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');

      const url = await uploadToBucket(
        asset.uri,
        'posts',
        mimeType,
        { folder: session.user.id }
      );

      uploadedUrls.push(url);
      types.push(mediaType);
    }

    onProgress?.({
      stage: 'saving',
      current: assets.length,
      total: assets.length,
    });

    const { data, error } = await supabase.rpc(
      'create_post_with_media',
      {
        p_urls: uploadedUrls,
        p_types: types,
        p_caption: cleanCaption(caption) || null,
      }
    );

    if (error) throw error;
    return data;
  } catch (error) {
    if (uploadedUrls.length) {
      try {
        await removeStorageUrls('posts', uploadedUrls);
      } catch (cleanupError) {
        console.warn(
          'Post creation failed and uploaded media cleanup also failed.',
          cleanupError
        );
      }
    }

    throw error;
  }
}

export async function fetchPostDetail(postId) {
  const session = await ensureAuthed();

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, user_id, caption, image_url, created_at')
    .eq('id', postId)
    .single();

  if (postError) throw postError;

  const [
    mediaResult,
    likesResult,
    commentsResult,
    authorResult,
  ] = await Promise.all([
    supabase
      .from('post_media')
      .select('id, post_id, url, media_type, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true }),
    supabase
      .from('post_likes')
      .select('post_id', { count: 'exact', head: true })
      .eq('post_id', postId),
    supabase
      .from('post_comments')
      .select('post_id', { count: 'exact', head: true })
      .eq('post_id', postId),
    supabase
      .from('users')
      .select('id, display_name, avatar_url')
      .eq('id', post.user_id)
      .maybeSingle(),
  ]);

  if (mediaResult.error) throw mediaResult.error;
  if (likesResult.error) throw likesResult.error;
  if (commentsResult.error) throw commentsResult.error;
  if (authorResult.error) throw authorResult.error;

  let likedByMe = false;

  const { data: ownLike, error: ownLikeError } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (ownLikeError) throw ownLikeError;
  likedByMe = Boolean(ownLike);

  return {
    post,
    author: authorResult.data || {
      id: post.user_id,
      display_name: 'Unknown',
      avatar_url: null,
    },
    media: mediaResult.data || [],
    likes: likesResult.count ?? 0,
    commentCount: commentsResult.count ?? 0,
    likedByMe,
    isOwner: post.user_id === session.user.id,
  };
}

export async function fetchOwnPostForEditing(postId) {
  const session = await ensureAuthed();

  const { data, error } = await supabase
    .from('posts')
    .select('id, user_id, caption, image_url, created_at')
    .eq('id', postId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('This post is unavailable or you do not own it.');
  }

  return data;
}

export async function updateOwnPostCaption(postId, caption) {
  await ensureAuthed();
  const clean = cleanCaption(caption);

  const { data, error } = await supabase
    .rpc('update_own_post_caption', {
      p_post_id: postId,
      p_caption: clean || null,
    })
    .single();

  if (error) throw error;
  return data;
}

async function fetchOwnPostMediaUrls(postId) {
  const session = await ensureAuthed();

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, user_id, image_url')
    .eq('id', postId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (postError) throw postError;
  if (!post) {
    throw new Error('This post is unavailable or you do not own it.');
  }

  const { data: media, error: mediaError } = await supabase
    .from('post_media')
    .select('url')
    .eq('post_id', postId);

  if (mediaError) throw mediaError;

  return Array.from(
    new Set([
      post.image_url,
      ...(media || []).map((item) => item.url),
    ].filter(Boolean))
  );
}

export async function deleteOwnPost(postId) {
  const urls = await fetchOwnPostMediaUrls(postId);

  if (urls.length) {
    await removeStorageUrls('posts', urls);
  }

  const { data, error } = await supabase.rpc('delete_own_post', {
    p_post_id: postId,
  });

  if (error) {
    throw new Error(
      `${error.message || 'The post could not be deleted.'} The media was already removed; refresh before trying again.`
    );
  }

  return data;
}
