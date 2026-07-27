function replaceRootRoute(navigation, name, params) {
  const parent = navigation.getParent?.();

  if (parent?.replace) {
    parent.replace(name, params);
    return;
  }

  navigation.replace(name, params);
}

export function replaceWithMainTabs(navigation) {
  replaceRootRoute(navigation, 'MainTabs');
}

export function replaceWithGuestClaimProfileSetup(navigation, eventGuestToken) {
  replaceRootRoute(navigation, 'GuestClaimProfileSetup', {
    eventGuestToken,
  });
}

export function replaceWithClaimedEvent(navigation, eventClaimResult) {
  replaceRootRoute(navigation, 'ClaimedEventConnections', {
    eventId: eventClaimResult.eventId,
    eventTitle: eventClaimResult.eventTitle || 'Event',
  });
}

export function replaceAfterOnboarding(navigation, eventClaimResult = null) {
  if (eventClaimResult?.eventId) {
    replaceWithClaimedEvent(navigation, eventClaimResult);
    return;
  }

  replaceWithMainTabs(navigation);
}
