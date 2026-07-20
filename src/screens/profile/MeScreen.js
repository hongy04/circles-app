import React from 'react';
import { ProfileViewScreen } from './ProfileViewScreen';

export function MeScreen({ navigation }) {
  return (
    <ProfileViewScreen
      navigation={navigation}
      isSelf
    />
  );
}
