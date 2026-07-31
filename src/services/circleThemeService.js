import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { isKnownTheme } from '../theme/themes';

function normalizeSharedThemeId(themeId) {
  const normalized = String(themeId || '').trim().toLowerCase();
  if (!normalized || normalized === 'default' || normalized === 'inherit') {
    return null;
  }
  return isKnownTheme(normalized) ? normalized : null;
}

export async function getCircleThemeSettings(conversationId) {
  await ensureAuthed();

  const { data, error } = await supabase.rpc('get_circle_theme_settings', {
    p_conversation_id: conversationId,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    themeId: normalizeSharedThemeId(row?.theme_id),
    canCustomize: Boolean(row?.can_customize),
    isTwoPerson: Boolean(row?.is_two_person),
  };
}

export async function saveCircleTheme(conversationId, themeId) {
  await ensureAuthed();

  const normalizedThemeId = normalizeSharedThemeId(themeId);
  const { data, error } = await supabase.rpc('set_circle_theme', {
    p_conversation_id: conversationId,
    p_theme_id: normalizedThemeId,
  });

  if (error) throw error;

  return {
    conversationId: data?.conversation_id || conversationId,
    themeId: normalizeSharedThemeId(data?.theme_id),
    inheritsGlobalTheme: Boolean(data?.inherits_global_theme),
    updatedAt: data?.updated_at || null,
  };
}
