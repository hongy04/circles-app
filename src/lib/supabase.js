import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import {
  SUPABASE_KEY,
  SUPABASE_URL,
  validatePublicEnvironment,
} from '../config/env';

validatePublicEnvironment();

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    ...(Platform.OS !== 'web'
      ? {
          storage: AsyncStorage,
          lock: processLock,
        }
      : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Native apps do not have a browser lifecycle to manage token refreshes.
// Refresh while Circles is active and pause while it is in the background.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
