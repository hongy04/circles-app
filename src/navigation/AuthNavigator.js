import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { COLORS } from '../theme/colors';
import { IS_DEVELOPMENT } from '../config/env';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { AuthEmailScreen } from '../screens/auth/AuthEmailScreen';
import { AuthOtpScreen } from '../screens/auth/AuthOtpScreen';
import { ProfileSetupScreen } from '../screens/auth/ProfileSetupScreen';
import { ContactsIntroScreen } from '../screens/auth/ContactsIntroScreen';
import { ContactsPickerScreen } from '../screens/auth/ContactsPickerScreen';
import { SyncingScreen } from '../screens/auth/SyncingScreen';
import { DevSignInScreen } from '../screens/auth/DevSignInScreen';

const Stack = createNativeStackNavigator();

export function AuthNavigator({ route }) {
  const inviteToken = route?.params?.inviteToken || null;
  const eventGuestToken = route?.params?.eventGuestToken || null;

  return (
    <Stack.Navigator
      initialRouteName="Welcome"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.bg },
        animation: 'fade_from_bottom',
      }}
    >
      <Stack.Screen
        name="Welcome"
        component={WelcomeScreen}
        initialParams={{ inviteToken, eventGuestToken }}
      />
      <Stack.Screen
        name="AuthEmail"
        component={AuthEmailScreen}
        initialParams={{ inviteToken, eventGuestToken }}
      />
      <Stack.Screen name="AuthOtp" component={AuthOtpScreen} />
      <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
      <Stack.Screen name="ContactsIntro" component={ContactsIntroScreen} />
      <Stack.Screen name="ContactsPicker" component={ContactsPickerScreen} />
      <Stack.Screen name="Syncing" component={SyncingScreen} />
      {IS_DEVELOPMENT ? (
        <Stack.Screen name="DevSignIn" component={DevSignInScreen} />
      ) : null}
    </Stack.Navigator>
  );
}
