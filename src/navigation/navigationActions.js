export function replaceWithMainTabs(navigation) {
  const parent = navigation.getParent?.();

  if (parent?.replace) {
    parent.replace('MainTabs');
    return;
  }

  navigation.replace('MainTabs');
}
