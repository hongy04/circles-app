// Lightweight, session-scoped in-memory cache for screen-to-screen continuity.
//
// This is intentionally not persisted. It exists only to let a destination
// render data the app already has while it quietly revalidates in the
// background. The cache is cleared whenever the authenticated account changes.

const entries = new Map();
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 96;
let scope = null;

function scopedKey(key) {
  return `${scope || 'anonymous'}::${String(key || '')}`;
}

function trimCache() {
  while (entries.size > MAX_ENTRIES) {
    const firstKey = entries.keys().next().value;
    if (!firstKey) break;
    entries.delete(firstKey);
  }
}

export function setNavigationCacheScope(userId = null) {
  const nextScope = userId ? String(userId) : null;
  if (scope === nextScope) return;
  scope = nextScope;
  entries.clear();
}

export function clearNavigationCache() {
  entries.clear();
}

export function readNavigationCache(key, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (!key) return null;
  const cacheKey = scopedKey(key);
  const entry = entries.get(cacheKey);
  if (!entry) return null;

  if (Date.now() - entry.savedAt > maxAgeMs) {
    entries.delete(cacheKey);
    return null;
  }

  // Refresh insertion order so frequently used screens stay warm.
  entries.delete(cacheKey);
  entries.set(cacheKey, entry);
  return entry.value;
}

export function writeNavigationCache(key, value) {
  if (!key || value == null) return;
  const cacheKey = scopedKey(key);
  entries.delete(cacheKey);
  entries.set(cacheKey, { value, savedAt: Date.now() });
  trimCache();
}

export function removeNavigationCache(key) {
  if (!key) return;
  entries.delete(scopedKey(key));
}

export const navigationCacheKeys = {
  feed: () => 'feed',
  mutuals: () => 'mutuals',
  inbox: () => 'inbox',
  notifications: () => 'notifications',
  conversationDetails: (conversationId) => `conversation-details:${conversationId}`,
  chat: (conversationId) => `chat:${conversationId}`,
  circlePeople: (conversationId) => `circle-people:${conversationId}`,
  circlePosts: (conversationId) => `circle-posts:${conversationId}`,
  circleTimeline: (conversationId) => `circle-timeline:${conversationId}`,
  circleDecoration: (conversationId) => `circle-decoration:${conversationId}`,
  circleEvents: (conversationId) => `circle-events:${conversationId}`,
  circlePolls: (conversationId) => `circle-polls:${conversationId}`,
  twoPersonPlans: (conversationId) => `two-person-plans:${conversationId}`,
  twoPersonDates: (conversationId) => `two-person-dates:${conversationId}`,
  importantDate: (importantDateId) => `two-person-date:${importantDateId}`,
  twoPersonThoughts: (conversationId) => `two-person-thoughts:${conversationId}`,
  twoPersonAlbums: (conversationId) => `two-person-albums:${conversationId}`,
  plan: (planId) => `two-person-plan:${planId}`,
  thought: (thoughtId) => `two-person-thought:${thoughtId}`,
  album: (albumId) => `two-person-album:${albumId}`,
  circlePost: (postId) => `circle-post:${postId}`,
  eventSummary: (eventId) => `event-summary:${eventId}`,
  eventDetails: (eventId) => `event-details:${eventId}`,
  eventPhotos: (eventId) => `event-photos:${eventId}`,
  pollSummary: (pollId) => `poll-summary:${pollId}`,
  pollDetails: (pollId) => `poll-details:${pollId}`,
  postPreview: (postId) => `post-preview:${postId}`,
  profilePage: (userId) => `profile-page:${userId || 'self'}`,
  profilePostsFeed: (userId) => `profile-posts-feed:${userId || 'self'}`,
};
