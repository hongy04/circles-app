import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import {
  DEFAULT_THEME_ID,
  isKnownTheme,
} from '../theme/themes';

const THEME_CACHE_PREFIX = '@circles/theme-preference:';

function cacheKey(userId) {
  return `${THEME_CACHE_PREFIX}${userId}`;
}

export function normalizeThemeId(value) {
  return isKnownTheme(value) ? value : DEFAULT_THEME_ID;
}

export async function readCachedThemePreference(userId) {
  if (!userId) return DEFAULT_THEME_ID;

  try {
    const stored = await AsyncStorage.getItem(cacheKey(userId));
    return normalizeThemeId(stored);
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export async function cacheThemePreference(userId, themeId) {
  if (!userId) return;

  try {
    await AsyncStorage.setItem(
      cacheKey(userId),
      normalizeThemeId(themeId)
    );
  } catch {
    // Theme persistence is a presentation preference. A local cache failure
    // should never block sign-in or app launch.
  }
}

export async function fetchMyThemePreference() {
  const { data, error } = await supabase
    .rpc('get_my_theme_preference')
    .single();

  if (error) throw error;
  return normalizeThemeId(data?.theme_id);
}

export async function saveMyThemePreference(themeId) {
  const normalizedThemeId = normalizeThemeId(themeId);

  const { data, error } = await supabase
    .rpc('set_my_theme_preference', {
      p_theme_id: normalizedThemeId,
    })
    .single();

  if (error) throw error;
  return normalizeThemeId(data?.theme_id);
}
