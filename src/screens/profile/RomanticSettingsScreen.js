import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import {
  fetchMyRomanticSettings,
  resumeMyRomanticDiscovery,
  saveMyRomanticSettings,
  setMyRomanticVisibility,
} from '../../services/romanticService';

function AudienceOption({ selected, title, body, onPress, disabled }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.audienceOption,
        selected && styles.audienceOptionSelected,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.radioOuter}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <View style={styles.audienceCopy}>
        <Text style={styles.audienceTitle}>{title}</Text>
        <Text style={styles.audienceBody}>{body}</Text>
      </View>
    </Pressable>
  );
}

function ConnectionVisibilityRow({ person, disabled, busy, onChange }) {
  return (
    <View style={[styles.personRow, disabled && styles.disabled]}>
      <Avatar
        size={46}
        name={person.displayName}
        uri={person.avatarUrl}
      />
      <View style={styles.personCopy}>
        <Text style={styles.personName} numberOfLines={1}>
          {person.displayName}
        </Text>
        <Text style={styles.personMeta} numberOfLines={1}>
          {person.username ? `@${person.username}` : 'Accepted connection'}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" />
      ) : (
        <Switch
          value={person.visible}
          disabled={disabled}
          onValueChange={onChange}
          accessibilityLabel={`Romantic visibility for ${person.displayName}`}
        />
      )}
    </View>
  );
}

export function RomanticSettingsScreen() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      setSettings(await fetchMyRomanticSettings());
    } catch (loadError) {
      setError(loadError?.message || 'Could not load romantic settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveGlobal = async ({ enabled, audienceMode }) => {
    if (!settings || saving) return;

    setSaving(true);
    try {
      const next = await saveMyRomanticSettings({
        enabled,
        ageConfirmed: enabled ? true : settings.ageConfirmed,
        audienceMode: audienceMode || settings.audienceMode,
      });
      setSettings(next);
    } catch (saveError) {
      Alert.alert(
        'Settings not updated',
        saveError?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const enableRomance = () => {
    const message =
      'Romantic features are for adults 18 or older. Your choices remain private, and a romantic channel appears only when both accepted connections independently include each other.';

    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${message}\n\nConfirm that you are 18 or older?`)) {
        saveGlobal({ enabled: true });
      }
      return;
    }

    Alert.alert('Confirm age eligibility', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'I am 18 or older',
        onPress: () => saveGlobal({ enabled: true }),
      },
    ]);
  };

  const toggleEnabled = (nextEnabled) => {
    if (nextEnabled) enableRomance();
    else saveGlobal({ enabled: false });
  };

  const changeAudience = (nextMode) => {
    if (!settings || saving || nextMode === settings.audienceMode) return;

    const title = nextMode === 'all_connections'
      ? 'Use all connections by default?'
      : 'Choose people individually?';
    const message =
      'Changing the audience strategy resets individual choices to the new default. No one is told about your change.';

    const perform = () => saveGlobal({
      enabled: settings.enabled,
      audienceMode: nextMode,
    });

    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n\n${message}`)) perform();
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change audience', onPress: perform },
    ]);
  };

  const changePersonVisibility = async (person, visible) => {
    if (!settings?.enabled || settings?.focusPaused || busyUserId) return;

    const previous = settings;
    setBusyUserId(person.userId);
    setSettings((current) => ({
      ...current,
      connections: current.connections.map((item) =>
        item.userId === person.userId ? { ...item, visible } : item
      ),
      visibleCount: Math.max(
        0,
        current.visibleCount + (visible ? 1 : -1)
      ),
    }));

    try {
      setSettings(await setMyRomanticVisibility(person.userId, visible));
    } catch (visibilityError) {
      setSettings(previous);
      Alert.alert(
        'Audience not updated',
        visibilityError?.message || 'Please try again.'
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const resumeDiscovery = async () => {
    if (!settings?.focusPaused || settings?.focusActive || saving) return;

    const perform = async () => {
      setSaving(true);
      try {
        setSettings(await resumeMyRomanticDiscovery());
      } catch (resumeError) {
        Alert.alert(
          'Romantic discovery not resumed',
          resumeError?.message || 'Please try again.'
        );
      } finally {
        setSaving(false);
      }
    };

    const message =
      'Your saved audience settings will become active again. Existing friendships and messages are unchanged.';

    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Resume romantic discovery?\n\n${message}`)) {
        perform();
      }
      return;
    }

    Alert.alert('Resume romantic discovery?', message, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Resume', onPress: perform },
    ]);
  };

  if (loading && !settings) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading privacy settings…</Text>
      </View>
    );
  }

  if (error && !settings) {
    return (
      <View style={styles.centered}>
        <Ionicons name="heart-dislike-outline" size={38} color={COLORS.subtext} />
        <Text style={styles.errorTitle}>Settings unavailable</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Pressable onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const connections = settings?.connections || [];

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={connections}
        keyExtractor={(person) => person.userId}
        renderItem={({ item }) => (
          <ConnectionVisibilityRow
            person={item}
            disabled={!settings.enabled || settings.focusPaused || saving}
            busy={busyUserId === item.userId}
            onChange={(visible) => changePersonVisibility(item, visible)}
          />
        )}
        ListHeaderComponent={(
          <View>
            <View style={styles.introCard}>
              <View style={styles.introIcon}>
                <Ionicons name="heart-outline" size={24} color={COLORS.text} />
              </View>
              <View style={styles.introCopy}>
                <Text style={styles.introTitle}>Reciprocal by design</Text>
                <Text style={styles.introBody}>
                  Your audience choices are private. Romantic features become available between two accepted connections only when both people independently include each other. Mutual Focus can later pause discovery outside one connection.
                </Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Open to romantic connections</Text>
                  <Text style={styles.settingBody}>
                    Off by default. Turning this off closes every romantic channel without affecting friendships or messages.
                  </Text>
                </View>
                {saving ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Switch
                    value={settings.enabled}
                    onValueChange={toggleEnabled}
                    accessibilityLabel="Open to romantic connections"
                  />
                )}
              </View>
            </View>

            {settings.focusPaused ? (
              <View style={styles.focusPauseCard}>
                <View style={styles.focusPauseIcon}>
                  <Ionicons name="pause" size={21} color={COLORS.text} />
                </View>
                <View style={styles.focusPauseCopy}>
                  <Text style={styles.focusPauseTitle}>
                    {settings.focusActive
                      ? 'Outside romantic discovery is paused'
                      : 'Romantic discovery remains paused'}
                  </Text>
                  <Text style={styles.focusPauseBody}>
                    {settings.focusActive
                      ? 'You are focusing on one connection. Hearts and romantic discovery with everyone else remain unavailable.'
                      : 'Ending Focus does not automatically reopen romantic discovery. Resume only when you are ready.'}
                  </Text>
                  {!settings.focusActive ? (
                    <Pressable
                      onPress={resumeDiscovery}
                      disabled={saving}
                      style={({ pressed }) => [
                        styles.resumeButton,
                        pressed && styles.pressed,
                        saving && styles.disabled,
                      ]}
                    >
                      <Text style={styles.resumeButtonText}>Resume romantic discovery</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>AUDIENCE</Text>
            <View style={styles.sectionCard}>
              <AudienceOption
                selected={settings.audienceMode === 'all_connections'}
                title="All accepted connections"
                body="Current and future accepted connections are included by default. You can exclude individual people below."
                disabled={!settings.enabled || settings.focusPaused || saving}
                onPress={() => changeAudience('all_connections')}
              />
              <View style={styles.separator} />
              <AudienceOption
                selected={settings.audienceMode === 'selected_connections'}
                title="Selected people only"
                body="No connection is included unless you turn them on individually below."
                disabled={!settings.enabled || settings.focusPaused || saving}
                onPress={() => changeAudience('selected_connections')}
              />
            </View>

            <View style={styles.privacyNote}>
              <Ionicons name="eye-off-outline" size={19} color={COLORS.subtext} />
              <Text style={styles.privacyNoteText}>
                You cannot see another person’s settings or whether they included you. An absent romantic channel never explains why.
              </Text>
            </View>

            <View style={styles.listHeadingRow}>
              <Text style={styles.sectionLabel}>INDIVIDUAL CONNECTIONS</Text>
              <Text style={styles.visibleCount}>
                {settings.focusPaused
                  ? 'Paused'
                  : settings.enabled
                    ? `${settings.visibleCount} included`
                    : 'Romance off'}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.emptyRoot}>
            <Ionicons name="people-outline" size={34} color={COLORS.subtext} />
            <Text style={styles.emptyTitle}>No accepted connections yet</Text>
            <Text style={styles.emptyBody}>
              Romantic visibility is available only between accepted connections.
            </Text>
          </View>
        )}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 48,
    gap: 10,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorTitle: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  errorBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  introCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    padding: 16,
    marginBottom: 18,
  },
  introIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introCopy: { flex: 1, marginLeft: 12 },
  introTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  introBody: {
    marginTop: 5,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  focusPauseCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f7f4ff',
    padding: 16,
    marginBottom: 18,
  },
  focusPauseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ece7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusPauseCopy: {
    flex: 1,
    marginLeft: 12,
  },
  focusPauseTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  focusPauseBody: {
    marginTop: 5,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  resumeButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    minHeight: 38,
    borderRadius: 11,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  resumeButtonText: {
    color: COLORS.bg,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  sectionLabel: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
    marginLeft: 4,
    marginBottom: 7,
  },
  sectionCard: {
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    overflow: 'hidden',
    marginBottom: 18,
  },
  settingRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  settingCopy: { flex: 1, paddingRight: 12 },
  settingTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  settingBody: {
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 17,
  },
  audienceOption: {
    flexDirection: 'row',
    padding: 14,
    minHeight: 82,
  },
  audienceOptionSelected: { backgroundColor: '#fafafa' },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.text,
  },
  audienceCopy: { flex: 1, marginLeft: 12 },
  audienceTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13.5,
  },
  audienceBody: {
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 17,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: 46,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    marginBottom: 22,
  },
  privacyNoteText: {
    flex: 1,
    marginLeft: 9,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 17,
  },
  listHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  visibleCount: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    marginBottom: 7,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: 12,
    backgroundColor: COLORS.bg,
  },
  personCopy: { flex: 1, marginHorizontal: 12 },
  personName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  personMeta: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  emptyRoot: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    marginTop: 10,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  emptyBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.45 },
});
