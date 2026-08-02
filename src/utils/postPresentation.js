export const POST_FRAME_PRESETS = [
  { id: 'portrait', label: 'Portrait', aspectRatio: 4 / 5, fit: 'crop' },
  { id: 'square', label: 'Square', aspectRatio: 1, fit: 'crop' },
  { id: 'landscape', label: 'Landscape', aspectRatio: 1.91, fit: 'crop' },
];

export const MIN_POST_ASPECT_RATIO = 0.45;
export const MAX_POST_ASPECT_RATIO = 2.5;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clampPostAspectRatio(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return clamp(numeric, MIN_POST_ASPECT_RATIO, MAX_POST_ASPECT_RATIO);
}

export function naturalPostAspectRatio(asset) {
  const width = Number(asset?.width || 0);
  const height = Number(asset?.height || 0);
  if (!width || !height) return 1;
  return clampPostAspectRatio(width / height);
}

export function makeDefaultCropPoint(asset) {
  return {
    x: 0.5,
    y: 0.5,
    width: Number(asset?.width || 0) || null,
    height: Number(asset?.height || 0) || null,
  };
}

export function normalizeCropPoint(point, fallbackAsset) {
  const fallback = makeDefaultCropPoint(fallbackAsset);
  const rawX = Number(point?.x ?? fallback.x);
  const rawY = Number(point?.y ?? fallback.y);
  return {
    x: clamp(Number.isFinite(rawX) ? rawX : fallback.x, 0, 1),
    y: clamp(Number.isFinite(rawY) ? rawY : fallback.y, 0, 1),
    width: Number(point?.width || fallback.width || 0) || null,
    height: Number(point?.height || fallback.height || 0) || null,
  };
}

export function makeDefaultMediaPresentation(asset) {
  const point = makeDefaultCropPoint(asset);
  return {
    aspectRatio: naturalPostAspectRatio(asset),
    fit: 'full',
    ...point,
  };
}

export function normalizeMediaPresentation(value, asset) {
  const fallback = makeDefaultMediaPresentation(asset);
  const point = normalizeCropPoint(value, asset);
  const fit = value?.fit === 'crop' ? 'crop' : 'full';
  const aspectRatio = clampPostAspectRatio(
    value?.aspectRatio ?? value?.aspect_ratio ?? fallback.aspectRatio,
    fallback.aspectRatio
  );

  return {
    aspectRatio,
    fit,
    ...point,
  };
}

export function serializeMediaPresentations(assets, presentationById = {}) {
  return (assets || []).map((asset) => normalizeMediaPresentation(presentationById?.[asset.id], asset));
}

export function presentationsByAssetId(assets, rawPresentations = []) {
  const list = Array.isArray(rawPresentations) ? rawPresentations : [];
  return Object.fromEntries(
    (assets || []).map((asset, index) => [
      asset.id,
      normalizeMediaPresentation(list[index], asset),
    ])
  );
}

// Backward-compatible helpers for posts saved under the first framing prototype.
export function normalizeCropPoints(points, assets = []) {
  const source = Array.isArray(points) ? points : [];
  return assets.map((asset, index) => normalizeCropPoint(source[index], asset));
}

export function serializeCropPoints(assets, cropById = {}) {
  return (assets || []).map((asset) => normalizeCropPoint(cropById?.[asset.id], asset));
}

export function normalizePostPresentation(source = {}, media = []) {
  const direct = source?.media_presentations ?? source?.mediaPresentations;
  if (Array.isArray(direct) && direct.length) {
    return { mediaPresentations: media.map((item, index) => normalizeMediaPresentation(direct[index], item)) };
  }

  const legacyAspect = source?.display_aspect_ratio ?? source?.displayAspectRatio ?? source?.aspectRatio ?? null;
  const legacyCropPoints = source?.media_crop_points ?? source?.mediaCropPoints ?? source?.cropPoints ?? [];
  if (legacyAspect != null || (Array.isArray(legacyCropPoints) && legacyCropPoints.length)) {
    return {
      mediaPresentations: media.map((item, index) => normalizeMediaPresentation({
        aspectRatio: legacyAspect ?? naturalPostAspectRatio(item),
        fit: 'crop',
        ...(legacyCropPoints[index] || {}),
      }, item)),
    };
  }

  return { mediaPresentations: media.map((item) => makeDefaultMediaPresentation(item)) };
}

export function mediaPresentationForIndex(presentation, index, mediaItem) {
  const list = presentation?.mediaPresentations || presentation?.media_presentations || [];
  return normalizeMediaPresentation(list[index], mediaItem);
}

// Legacy name retained for any untouched call sites during migration.
export function cropPointForIndex(presentation, index, mediaItem) {
  return mediaPresentationForIndex(presentation, index, mediaItem);
}
