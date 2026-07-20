const MB = 1024 * 1024;

export const MEDIA_LIMITS = {
  storyImageBytes: 15 * MB,
  storyVideoBytes: 25 * MB,
  storyVideoDurationMs: 30 * 1000,
  postAssetBytes: 48 * MB,
  postVideoDurationMs: 2 * 60 * 1000,
  postAssetCount: 10,
};

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`;
}

export function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return minutes ? `${minutes}:${seconds}` : `${totalSeconds}s`;
}

function isVideo(asset) {
  return asset?.type === 'video' || asset?.mimeType?.startsWith('video/');
}

export function validateStoryAsset(asset) {
  if (!asset?.uri) {
    return 'Choose a photo or video for your story.';
  }

  const video = isVideo(asset);
  const maxBytes = video
    ? MEDIA_LIMITS.storyVideoBytes
    : MEDIA_LIMITS.storyImageBytes;

  if (asset.fileSize && asset.fileSize > maxBytes) {
    const actual = formatFileSize(asset.fileSize);
    const maximum = formatFileSize(maxBytes);
    return `${video ? 'Video' : 'Photo'} is ${actual}. Stories must be ${maximum} or smaller.`;
  }

  if (
    video &&
    asset.duration &&
    asset.duration > MEDIA_LIMITS.storyVideoDurationMs
  ) {
    return `This video is ${formatDuration(asset.duration)}. Story videos can be up to ${formatDuration(MEDIA_LIMITS.storyVideoDurationMs)}.`;
  }

  return null;
}

export function validatePostAssets(assets) {
  if (!assets?.length) {
    return 'Select at least one photo or video.';
  }

  if (assets.length > MEDIA_LIMITS.postAssetCount) {
    return `Posts can contain up to ${MEDIA_LIMITS.postAssetCount} items.`;
  }

  for (const asset of assets) {
    if (asset.fileSize && asset.fileSize > MEDIA_LIMITS.postAssetBytes) {
      const name = asset.fileName || (isVideo(asset) ? 'A video' : 'A photo');
      return `${name} is ${formatFileSize(asset.fileSize)}. Each post item must be ${formatFileSize(MEDIA_LIMITS.postAssetBytes)} or smaller.`;
    }

    if (
      isVideo(asset) &&
      asset.duration &&
      asset.duration > MEDIA_LIMITS.postVideoDurationMs
    ) {
      return `Post videos can be up to ${formatDuration(MEDIA_LIMITS.postVideoDurationMs)}.`;
    }
  }

  return null;
}
