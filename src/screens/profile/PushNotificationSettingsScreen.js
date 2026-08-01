import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationState,
  openNotificationSystemSettings,
} from '../../services/pushNotificationService';

function statusCopy(state) {
  if (!state?.supported && state?.reason === 'expo_go') {
    return {
      icon: 'build-outline',
      title: 'Development build required',
      body: 'Expo Go cannot receive remote push notifications for this app. Install a Circles development or production build to finish setup.',
    };
  }

  if (!state?.supported) {
    return {
      icon: 'phone-portrait-outline',
      title: 'Unavailable on this platform',
      body: 'Device push notifications are available in the iOS and Android apps.',
    };
  }

  if (state.permissionStatus === 'denied') {
    const blocked = state.canAskAgain === false;
    return {
      icon: 'notifications-off-outline',
      title: blocked ? 'Blocked in system settings' : 'Permission not granted',
      body: blocked
        ? 'Circles cannot ask again on this device. Open system settings to allow notifications.'
        : 'You can try enabling notifications again when you are ready.',
    };
  }

  if (state.registered) {
    return {
      icon: 'notifications-outline',
      title: 'Push notifications are on',
      body: `${state.activeDeviceCount} registered ${state.activeDeviceCount === 1 ? 'device' : 'devices'} for this account.`,
    };
  }

  return {
    icon: 'notifications-outline',
    title: 'Push notifications are off on this device',
    body: state.activeDeviceCount > 0
      ? `${state.activeDeviceCount} other registered ${state.activeDeviceCount === 1 ? 'device remains' : 'devices remain'} on this account.`
      : 'Turn them on to receive private activity updates while Circles is closed.',
  };
}

export function PushNotificationSettingsScreen() {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await getPushNotificationState());
    } catch (error) {
      Alert.alert('Push status unavailable', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const run = async (action, failureTitle) => {
    setBusy(true);
    try {
      setState(await action());
    } catch (error) {
      Alert.alert(failureTitle, error?.message || 'Please try again.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const copy = statusCopy(state);
  const needsSystemSettings = state?.supported
    && state?.permissionStatus === 'denied'
    && state?.canAskAgain === false;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.statusCard}>
          <View style={styles.iconWrap}>
            <Ionicons name={copy.icon} size={27} color={theme.colors.text} />
          </View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
        </View>

        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>Private lock-screen wording</Text>
          <Text style={styles.privacyBody}>
            Message text, report details, birth dates, private romantic choices,
            evidence, and moderator notes are never placed in push payloads.
          </Text>
        </View>

        {state?.supported && !state?.registered && !needsSystemSettings ? (
          <Pressable
            disabled={busy}
            onPress={() => run(enablePushNotifications, 'Could not enable notifications')}
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || busy) && styles.buttonPressed,
            ]}
          >
            {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
              <Text style={styles.primaryButtonText}>Enable Push Notifications</Text>
            )}
          </Pressable>
        ) : null}

        {needsSystemSettings ? (
          <Pressable
            disabled={busy}
            onPress={() => run(async () => {
              await openNotificationSystemSettings();
              return getPushNotificationState();
            }, 'Could not open settings')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.primaryButtonText}>Open System Settings</Text>
          </Pressable>
        ) : null}

        {state?.registered ? (
          <Pressable
            disabled={busy}
            onPress={() => run(disablePushNotifications, 'Could not disable notifications')}
            style={({ pressed }) => [
              styles.secondaryButton,
              (pressed || busy) && styles.buttonPressed,
            ]}
          >
            {busy ? <ActivityIndicator /> : (
              <Text style={styles.secondaryButtonText}>Disable for This Account</Text>
            )}
          </Pressable>
        ) : null}

        <Text style={styles.footer}>
          Conversation mute and notification preferences still control which
          message and Circle activity alerts are delivered. Safety outcomes are
          never hidden by a conversation mute.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    padding: 18,
  },
  statusCard: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    marginBottom: 15,
  },
  title: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    textAlign: 'center',
  },
  body: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  privacyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceSoft,
    padding: 16,
    marginTop: 16,
  },
  privacyTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  privacyBody: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: theme.circle.accent,
    marginTop: 18,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: theme.colors.onPrimary,
    fontFamily: 'Manrope_700Bold',
  },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginTop: 12,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
  },
  buttonPressed: { opacity: 0.68 },
  footer: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 10,
  },
  });
}
