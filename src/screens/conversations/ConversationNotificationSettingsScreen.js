import React, { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import {
  getConversationNotificationSettings,
  setConversationMute,
  updateConversationNotificationPreferences,
} from '../../services/notificationService';

function formatMuteLabel(settings) {
  if (!settings?.muted) return 'On';
  if (settings.mutedForever) return 'Muted until you turn it back on';

  const until = new Date(settings.mutedUntil);
  if (!Number.isFinite(until.getTime())) return 'Muted';

  return `Muted until ${until.toLocaleString([], {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function SettingRow({
  icon,
  title,
  body,
  value,
  disabled,
  onValueChange,
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={20} color={COLORS.text} />
      </View>
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingBody}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#d1d1d6', true: '#7b7b7b' }}
        thumbColor="#fff"
      />
    </View>
  );
}

export function ConversationNotificationSettingsScreen({ route }) {
  const { conversationId } = route.params || {};
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError('');

    try {
      setSettings(await getConversationNotificationSettings(conversationId));
    } catch (loadError) {
      setError(loadError?.message || 'Could not load notification settings.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const muteLabel = useMemo(() => formatMuteLabel(settings), [settings]);

  const applyMute = async (duration) => {
    if (saving) return;
    setSaving(true);
    try {
      setSettings(await setConversationMute(conversationId, duration));
    } catch (muteError) {
      Alert.alert(
        'Mute setting not changed',
        muteError?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const showMuteOptions = () => {
    const options = settings?.muted
      ? ['Cancel', 'Unmute', 'Mute for 1 hour', 'Mute for 8 hours', 'Mute for 1 week', 'Mute until I turn it back on']
      : ['Cancel', 'Mute for 1 hour', 'Mute for 8 hours', 'Mute for 1 week', 'Mute until I turn it back on'];

    const runOption = (label) => {
      if (label === 'Unmute') applyMute('off');
      if (label === 'Mute for 1 hour') applyMute('1_hour');
      if (label === 'Mute for 8 hours') applyMute('8_hours');
      if (label === 'Mute for 1 week') applyMute('1_week');
      if (label === 'Mute until I turn it back on') applyMute('forever');
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: settings?.muted ? 1 : undefined,
          title: settings?.title || 'Notification settings',
          message: 'Muting quiets alerts. Unread messages and private activity remain visible inside Circles.',
        },
        (index) => {
          if (index > 0) runOption(options[index]);
        }
      );
      return;
    }

    Alert.alert(
      settings?.title || 'Notification settings',
      'Muting quiets alerts. Unread messages and private activity remain visible inside Circles.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(settings?.muted ? [{ text: 'Unmute', onPress: () => applyMute('off') }] : []),
        { text: 'Mute 1 hour', onPress: () => applyMute('1_hour') },
        { text: 'Mute 8 hours', onPress: () => applyMute('8_hours') },
        { text: 'Mute 1 week', onPress: () => applyMute('1_week') },
        { text: 'Mute until changed', onPress: () => applyMute('forever') },
      ]
    );
  };

  const updatePreference = async (key, value) => {
    if (!settings || saving) return;

    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSaving(true);

    try {
      setSettings(await updateConversationNotificationPreferences(
        conversationId,
        next
      ));
    } catch (saveError) {
      setSettings(previous);
      Alert.alert(
        'Preference not saved',
        saveError?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Loading notification settings…</Text>
      </SafeAreaView>
    );
  }

  if (error || !settings) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="notifications-off-outline" size={38} color={COLORS.subtext} />
        <Text style={styles.errorText}>{error || 'Settings unavailable.'}</Text>
        <Pressable onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headingBlock}>
          <Ionicons
            name={settings.muted ? 'notifications-off-outline' : 'notifications-outline'}
            size={34}
            color={COLORS.text}
          />
          <Text style={styles.title}>{settings.title}</Text>
          <Text style={styles.subtitle}>
            These preferences belong only to your account. Other members keep
            their own independent notification settings.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>ALERT STATUS</Text>
        <Pressable
          onPress={showMuteOptions}
          disabled={saving}
          style={({ pressed }) => [
            styles.muteCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.muteIcon}>
            <Ionicons
              name={settings.muted ? 'notifications-off' : 'notifications'}
              size={21}
              color={settings.muted ? COLORS.subtext : COLORS.text}
            />
          </View>
          <View style={styles.muteText}>
            <Text style={styles.muteTitle}>{settings.muted ? 'Muted' : 'Alerts active'}</Text>
            <Text style={styles.muteBody}>{muteLabel}</Text>
          </View>
          {saving ? (
            <ActivityIndicator size="small" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
          )}
        </Pressable>

        <Text style={styles.sectionLabel}>WHAT ALERTS YOU</Text>
        <View style={styles.settingsCard}>
          <SettingRow
            icon="chatbubble-outline"
            title="New messages"
            body="Count new private messages toward your Circles alert badge."
            value={settings.notifyMessages}
            disabled={saving}
            onValueChange={(value) => updatePreference('notifyMessages', value)}
          />

          {settings.isCircle ? (
            <>
              <View style={styles.divider} />
              <SettingRow
                icon="albums-outline"
                title="New Circle posts"
                body="Alert you when another member creates an intentional Circle post."
                value={settings.notifyCirclePosts}
                disabled={saving}
                onValueChange={(value) => updatePreference('notifyCirclePosts', value)}
              />
              <View style={styles.divider} />
              <SettingRow
                icon="heart-outline"
                title="Likes and comments"
                body="Alert you when a member likes or comments on one of your Circle posts."
                value={settings.notifyCircleInteractions}
                disabled={saving}
                onValueChange={(value) => updatePreference('notifyCircleInteractions', value)}
              />
            </>
          ) : null}
        </View>

        <View style={styles.authenticityCard}>
          <Ionicons name="eye-outline" size={20} color={COLORS.text} />
          <View style={styles.authenticityText}>
            <Text style={styles.authenticityTitle}>Authenticity stays intact</Text>
            <Text style={styles.authenticityBody}>
              Muting never marks messages as read, deletes activity, or changes
              what happened. It only quiets alerts and the global badge.
            </Text>
          </View>
        </View>

        <Text style={styles.pushNote}>
          These settings power Circles’ in-app alerts now and are ready to be
          respected by device push notifications when push delivery is added.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 44 },
  headingBlock: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18 },
  title: {
    marginTop: 9,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 500,
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 7,
    marginLeft: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 0.7,
  },
  muteCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f7f7f7',
  },
  muteIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#ececec',
  },
  muteText: { flex: 1, marginHorizontal: 12 },
  muteTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  muteBody: { marginTop: 3, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11 },
  settingsCard: {
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  settingRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  settingIcon: { width: 35, alignItems: 'flex-start' },
  settingText: { flex: 1, paddingRight: 12 },
  settingTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  settingBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 49, backgroundColor: COLORS.border },
  authenticityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 20,
    padding: 15,
    borderRadius: 14,
    backgroundColor: '#f4f4f4',
  },
  authenticityText: { flex: 1 },
  authenticityTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  authenticityBody: {
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 17,
  },
  pushNote: {
    marginTop: 15,
    paddingHorizontal: 8,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
  },
  stateText: { marginTop: 10, color: COLORS.subtext, fontFamily: 'Manrope_400Regular' },
  errorText: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.7 },
});
