import React from 'react';
import { ProfileViewScreen } from './ProfileViewScreen';

export function ProfileScreen({ navigation, route }) {
  return (
    <ProfileViewScreen
      navigation={navigation}
      userId={route?.params?.userId}
      sourceEventId={route?.params?.sourceEventId}
    />
  );
}
