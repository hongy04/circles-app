import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { COLORS } from '../theme/colors';
import { AuthPhoneScreen } from '../screens/auth/AuthPhoneScreen';
import { AuthOtpScreen } from '../screens/auth/AuthOtpScreen';
import { ContactsIntroScreen } from '../screens/auth/ContactsIntroScreen';
import { ContactsPickerScreen } from '../screens/auth/ContactsPickerScreen';
import { SyncingScreen } from '../screens/auth/SyncingScreen';

const Stack = createNativeStackNavigator();

export function AuthNavigator({ route }) {
  const inviteToken = route?.params?.inviteToken || null;
  const eventGuestToken = route?.params?.eventGuestToken || null;
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.bg },
      }}
    >
      <Stack.Screen
        name="AuthPhone"
        component={AuthPhoneScreen}
        initialParams={{ inviteToken, eventGuestToken }}
      />
      <Stack.Screen name="AuthOtp" component={AuthOtpScreen} />
      <Stack.Screen
        name="ContactsIntro"
        component={ContactsIntroScreen}
      />
      <Stack.Screen
        name="ContactsPicker"
        component={ContactsPickerScreen}
      />
      <Stack.Screen name="Syncing" component={SyncingScreen} />
    </Stack.Navigator>
  );
}
