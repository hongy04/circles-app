import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { uploadToBucket } from './uploadService';

export async function createPostWithMedia({
  assets,
  caption,
  onProgress,
}) {
  await ensureAuthed();

  if (!assets?.length) {
    throw new Error('Select at least one photo or video.');
  }

  const urls = [];
  const types = [];

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
      mimeType
    );

    urls.push(url);
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
      p_urls: urls,
      p_types: types,
      p_caption: caption?.trim() || null,
    }
  );

  if (error) throw error;
  return data;
}

export async function fetchPostDetail(postId) {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, user_id, caption, image_url, created_at')
    .eq('id', postId)
    .single();

  if (postError) throw postError;

  const [mediaResult, likesResult, authorResult, sessionResult] =
    await Promise.all([
      supabase
        .from('post_media')
        .select('id, url, media_type, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true }),
      supabase
        .from('post_likes')
        .select('post_id', { count: 'exact', head: true })
        .eq('post_id', postId),
      supabase
        .from('users')
        .select('id, display_name, avatar_url')
        .eq('id', post.user_id)
        .maybeSingle(),
      supabase.auth.getSession(),
    ]);

  if (mediaResult.error) throw mediaResult.error;
  if (likesResult.error) throw likesResult.error;
  if (authorResult.error) throw authorResult.error;
  if (sessionResult.error) throw sessionResult.error;

  let likedByMe = false;
  const session = sessionResult.data.session;

  if (session) {
    const { data: ownLike, error: ownLikeError } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (ownLikeError) throw ownLikeError;
    likedByMe = Boolean(ownLike);
  }

  return {
    post,
    author: authorResult.data || {
      id: post.user_id,
      display_name: 'Unknown',
      avatar_url: null,
    },
    media: mediaResult.data || [],
    likes: likesResult.count ?? 0,
    likedByMe,
  };
}
