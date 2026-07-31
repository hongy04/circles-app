import React, { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { EAS_PROJECT_ID } from '../config/env';
import { supabase } from '../lib/supabase';
import {
  flushPendingPushDestination,
  openPushDestination,
  queuePushDestination,
  rootNavigationRef,
} from '../navigation/rootNavigation';
import { ensureAuthed } from './authService';
import { markNotificationRead } from './notificationService';

const ANDROID_CHANNEL_ID = 'circles-activity';
let lastHandledResponseId = null;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function getProjectId() {
  return (
    EAS_PROJECT_ID
    || Constants.easConfig?.projectId
    || Constants.expoConfig?.extra?.eas?.projectId
    || ''
  ).trim();
}

function isExpoGo() {
  return (
    Constants.appOwnership === 'expo'
    || Constants.executionEnvironment === 'storeClient'
  );
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Circles activity',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#000000',
    sound: 'default',
  });
}

async function getCurrentExpoToken({ requireGranted = true } = {}) {
  if (Platform.OS === 'web' || isExpoGo()) return null;

  const permissions = await Notifications.getPermissionsAsync();
  if (requireGranted && permissions.status !== 'granted') return null;

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error(
      'Push notifications need EXPO_PUBLIC_EAS_PROJECT_ID. Add the EAS project ID and rebuild the app.'
    );
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token?.data || null;
}

async function registerToken(expoPushToken) {
  if (!expoPushToken) return null;
  await ensureAuthed();

  const { data, error } = await supabase.rpc('register_my_push_device', {
    p_expo_push_token: expoPushToken,
    p_platform: Platform.OS,
    p_app_version: Constants.expoConfig?.version || null,
  });

  if (error) throw error;
  return data;
}

export async function getPushNotificationState() {
  if (Platform.OS === 'web') {
    return {
      supported: false,
      reason: 'web',
      permissionStatus: 'unsupported',
      canAskAgain: false,
      activeDeviceCount: 0,
      registered: false,
    };
  }

  if (isExpoGo()) {
    return {
      supported: false,
      reason: 'expo_go',
      permissionStatus: 'unavailable',
      canAskAgain: false,
      activeDeviceCount: 0,
      registered: false,
    };
  }

  const permissions = await Notifications.getPermissionsAsync();
  const expoPushToken = permissions.status === 'granted'
    ? await getCurrentExpoToken({ requireGranted: true })
    : null;
  const registration = await supabase.rpc('get_my_push_notification_status', {
    p_expo_push_token: expoPushToken,
  });

  if (registration.error) throw registration.error;
  const activeDeviceCount = Number(registration.data?.active_device_count || 0);

  return {
    supported: true,
    reason: null,
    permissionStatus: permissions.status,
    canAskAgain: permissions.canAskAgain !== false,
    activeDeviceCount,
    registered: Boolean(registration.data?.current_device_registered),
    lastRegisteredAt: registration.data?.last_registered_at || null,
  };
}

export async function enablePushNotifications() {
  if (Platform.OS === 'web' || isExpoGo()) {
    throw new Error('Remote push notifications require an installed development or production build.');
  }

  await ensureAndroidChannel();

  let permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') {
    permissions = await Notifications.requestPermissionsAsync();
  }

  if (permissions.status !== 'granted') {
    throw new Error(
      permissions.canAskAgain === false
        ? 'Notifications are disabled in system settings.'
        : 'Notification permission was not granted.'
    );
  }

  const expoPushToken = await getCurrentExpoToken({ requireGranted: true });
  await registerToken(expoPushToken);
  return getPushNotificationState();
}

export async function syncExistingPushRegistration() {
  if (Platform.OS === 'web' || isExpoGo()) return null;

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') return null;

  await ensureAndroidChannel();
  const expoPushToken = await getCurrentExpoToken({ requireGranted: true });
  return registerToken(expoPushToken);
}

export async function unregisterCurrentPushDevice({ bestEffort = false } = {}) {
  try {
    if (Platform.OS === 'web' || isExpoGo()) return;

    const expoPushToken = await getCurrentExpoToken({ requireGranted: false });
    if (!expoPushToken) return;

    const { error } = await supabase.rpc('unregister_my_push_device', {
      p_expo_push_token: expoPushToken,
    });
    if (error) throw error;
  } catch (error) {
    if (!bestEffort) throw error;
  }
}

export async function disablePushNotifications() {
  await unregisterCurrentPushDevice();
  return getPushNotificationState();
}

export async function openNotificationSystemSettings() {
  await Linking.openSettings();
}

async function handleNotificationResponse(response) {
  const responseId = response?.notification?.request?.identifier || null;
  if (responseId && responseId === lastHandledResponseId) return;
  lastHandledResponseId = responseId;

  const data = response?.notification?.request?.content?.data || {};
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    queuePushDestination(data);
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('Auth');
    }
    return;
  }

  if (data.notificationId) {
    markNotificationRead(data.notificationId).catch(() => {});
  }
  openPushDestination(data);
}

export function PushNotificationBootstrap() {
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    let mounted = true;
    let tokenSubscription = null;

    const sync = () => {
      syncExistingPushRegistration().catch(() => {});
    };

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data?.session?.user) sync();
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted || !session?.user) return;
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          [0, 2000, 8000].forEach((delay) => {
            setTimeout(() => {
              if (!mounted) return;
              sync();
              flushPendingPushDestination();
            }, delay);
          });
        }
      }
    );

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        handleNotificationResponse(response).catch(() => {});
      }
    );

    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {});

    if (typeof Notifications.addPushTokenListener === 'function') {
      tokenSubscription = Notifications.addPushTokenListener(() => sync());
    }

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (mounted && response) return handleNotificationResponse(response);
        return null;
      })
      .catch(() => {});

    return () => {
      mounted = false;
      authSubscription?.subscription?.unsubscribe?.();
      responseSubscription.remove();
      receivedSubscription.remove();
      tokenSubscription?.remove?.();
    };
  }, []);

  return null;
}
