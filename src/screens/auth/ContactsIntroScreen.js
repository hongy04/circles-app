import React from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { replaceAfterOnboarding } from '../../navigation/navigationActions';
import { authStyles } from './authStyles';

export function ContactsIntroScreen({ route, navigation }) {
  const inviteResult = route?.params?.inviteResult || null;
  const inviteError = route?.params?.inviteError || '';
  const eventClaimResult = route?.params?.eventClaimResult || null;
  const eventClaimError = route?.params?.eventClaimError || '';
  const isWeb = Platform.OS === 'web';

  const continueFromIntro = () => {
    if (isWeb) {
      replaceAfterOnboarding(navigation, eventClaimResult);
      return;
    }

    navigation.replace('ContactsPicker', { eventClaimResult });
  };

  return (
    <SafeAreaView style={authStyles.root} edges={['top']}>
      <Text style={authStyles.title}>Find your mutuals</Text>

      <Text style={authStyles.caption}>
        {isWeb
          ? 'Contact syncing uses your phone’s native contacts, so it is not available in the browser.'
          : 'We match only with people who also have your number. Exclude anyone before syncing.'}
      </Text>

      {isWeb ? (
        <View style={authStyles.webNotice}>
          <Text style={authStyles.caption}>
            Continue to Circles here, then sync contacts later from the mobile
            app.
          </Text>
        </View>
      ) : null}


      {inviteResult ? (
        <View style={authStyles.webNotice}>
          <Text style={authStyles.caption}>
            {inviteResult.kind === 'circle'
              ? `Your invitation to ${inviteResult.circleName} is ready. You can review it after contact setup.`
              : `${inviteResult.inviterName}'s connection request is ready. You can review it after contact setup.`}
          </Text>
        </View>
      ) : null}

      {inviteError ? (
        <View style={authStyles.webNotice}>
          <Text style={authStyles.caption}>
            You are signed in, but the invitation could not be applied: {inviteError}
          </Text>
        </View>
      ) : null}

      {eventClaimResult ? (
        <View style={authStyles.webNotice}>
          <Text style={authStyles.caption}>
            {eventClaimResult.eventTitle} is now linked to your account. After setup, you can see the people who were confirmed there and choose whether to connect.
          </Text>
        </View>
      ) : null}

      {eventClaimError ? (
        <View style={authStyles.webNotice}>
          <Text style={authStyles.caption}>
            You are signed in, but the event could not be linked: {eventClaimError}
          </Text>
        </View>
      ) : null}

      <View style={{ height: 16 }} />

      <Pressable
        style={authStyles.primaryButton}
        onPress={continueFromIntro}
      >
        <Text style={authStyles.primaryButtonText}>
          {eventClaimResult
            ? isWeb ? 'Open people from the event' : 'Choose Contacts'
            : isWeb ? 'Continue to Circles' : 'Choose Contacts'}
        </Text>
      </Pressable>

      {!isWeb ? (
        <Pressable
          style={{ marginTop: 12 }}
          onPress={() => replaceAfterOnboarding(navigation, eventClaimResult)}
        >
          <Text style={authStyles.linkText}>Skip for now</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}
