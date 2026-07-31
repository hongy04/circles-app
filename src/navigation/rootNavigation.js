import { createNavigationContainerRef } from '@react-navigation/native';

export const rootNavigationRef = createNavigationContainerRef();

let pendingPushData = null;

function openCirclesStack(screen, params) {
  rootNavigationRef.navigate('MainTabs', {
    screen: 'Circles',
    params: {
      screen,
      params,
    },
  });
}

export function queuePushDestination(data) {
  pendingPushData = data || null;
}

export function openPushDestination(data) {
  const payload = data && typeof data === 'object' ? data : {};

  if (!rootNavigationRef.isReady()) {
    queuePushDestination(payload);
    return false;
  }

  switch (payload.route) {
    case 'chat':
      if (payload.conversationId) {
        openCirclesStack('Chat', { conversationId: payload.conversationId });
        return true;
      }
      break;
    case 'inbox':
      openCirclesStack('Inbox');
      return true;
    case 'mutuals':
      rootNavigationRef.navigate('MainTabs', { screen: 'Mutuals' });
      return true;
    case 'post':
      if (payload.postId) {
        rootNavigationRef.navigate('PostDetail', {
          postId: payload.postId,
          openComments: Boolean(payload.openComments),
          source: 'push_notification',
        });
        return true;
      }
      break;
    case 'circle_post':
      if (payload.postId && payload.conversationId) {
        openCirclesStack('CirclePostDetail', {
          postId: payload.postId,
          conversationId: payload.conversationId,
        });
        return true;
      }
      break;
    case 'safety_reports':
      rootNavigationRef.navigate('MySafetyReports');
      return true;
    case 'account_appeal':
      rootNavigationRef.navigate('AccountAppeal');
      return true;
    case 'age_correction':
      rootNavigationRef.navigate('AgeCorrectionRequest');
      return true;
    case 'notifications':
    default:
      openCirclesStack('Notifications');
      return true;
  }

  openCirclesStack('Notifications');
  return true;
}

export function flushPendingPushDestination() {
  if (!pendingPushData || !rootNavigationRef.isReady()) return false;
  const next = pendingPushData;
  pendingPushData = null;
  return openPushDestination(next);
}
