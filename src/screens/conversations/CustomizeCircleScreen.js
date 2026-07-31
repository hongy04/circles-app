import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '../../components/Avatar';
import {
  getCircleThemeSettings,
  saveCircleTheme,
} from '../../services/circleThemeService';
import { getConversationDetails } from '../../services/conversationService';
import {
  THEME_OPTIONS,
  getTheme,
} from '../../theme/themes';
import {
  ThemeScope,
  useTheme,
  useThemeTokens,
} from '../../theme/ThemeProvider';

const INHERIT_OPTION_ID = 'inherit-global';

function ThemePalette({ themeId, selected, inheritedThemeId }) {
  const optionTheme = getTheme(
    themeId === INHERIT_OPTION_ID ? inheritedThemeId : themeId
  );

  return (
    <View style={styles.paletteRow}>
      {optionTheme.circle.decalPalette.slice(0, 5).map((color, index) => (
        <View
          key={`${themeId}-${color}-${index}`}
          style={[
            styles.paletteDot,
            {
              backgroundColor: color,
              borderColor: selected
                ? optionTheme.circle.accent
                : 'rgba(10,18,34,0.08)',
            },
          ]}
        />
      ))}
    </View>
  );
}

function CircleThemePreview({ circleName, avatarUri, isTwoPerson }) {
  const theme = useThemeTokens();
  const themedStyles = useMemo(() => createPreviewStyles(theme), [theme]);

  return (
    <LinearGradient
      colors={theme.circle.headerGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={themedStyles.preview}
    >
      <View
        style={[
          themedStyles.decal,
          themedStyles.decalOne,
          { backgroundColor: theme.circle.decalPalette[1] },
        ]}
      />
      <View
        style={[
          themedStyles.decal,
          themedStyles.decalTwo,
          { backgroundColor: theme.circle.decalPalette[3] },
        ]}
      />
      <View
        style={[
          themedStyles.decal,
          themedStyles.decalThree,
          { backgroundColor: theme.circle.decalPalette[4] },
        ]}
      />

      <Avatar size={72} name={circleName} uri={avatarUri} />
      <Text style={themedStyles.previewTitle} numberOfLines={2}>
        {circleName}
      </Text>
      <View style={themedStyles.privateRow}>
        <Ionicons name="lock-closed" size={11} color={theme.colors.subtext} />
        <Text style={themedStyles.privateText}>
          {isTwoPerson ? 'Private to the two of you' : 'Invitation-only Circle'}
        </Text>
      </View>

      <View style={themedStyles.statRow}>
        {['Posts', isTwoPerson ? 'Plans' : 'People', 'Timeline'].map((label, index) => (
          <View key={label} style={themedStyles.stat}>
            <Text style={themedStyles.statValue}>{[8, 4, 12][index]}</Text>
            <Text style={themedStyles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={themedStyles.actionRow}>
        <View style={themedStyles.primaryAction}>
          <Ionicons name="add" size={15} color={theme.welcome.brandInk} />
          <Text style={themedStyles.primaryActionText}>New Post</Text>
        </View>
        <View style={themedStyles.secondaryAction}>
          <Ionicons name="ellipsis-horizontal" size={15} color={theme.colors.text} />
          <Text style={themedStyles.secondaryActionText}>More</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function CustomizeCircleContent({
  navigation,
  conversation,
  settings,
  selectedThemeId,
  setSelectedThemeId,
  saving,
  save,
  globalThemeId,
  globalThemeName,
}) {
  const theme = useThemeTokens();
  const themedStyles = useMemo(() => createThemedStyles(theme), [theme]);
  const isInherited = selectedThemeId === INHERIT_OPTION_ID;
  const selectedName = isInherited
    ? `My ${globalThemeName} theme`
    : getTheme(selectedThemeId).name;

  const options = [
    {
      id: INHERIT_OPTION_ID,
      name: 'Use each member’s app theme',
      description: 'The Circle adapts to each person’s own global Appearance choice.',
    },
    ...THEME_OPTIONS,
  ];

  return (
    <SafeAreaView edges={['bottom']} style={themedStyles.screen}>
      <ScrollView
        contentContainerStyle={themedStyles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={themedStyles.title}>Give this Circle its own atmosphere.</Text>
        <Text style={themedStyles.subtitle}>
          Choose one shared look for everyone, or let each member see this Circle
          through their own app theme.
        </Text>

        <CircleThemePreview
          circleName={conversation.title || (settings.isTwoPerson ? 'Our Circle' : 'Circle')}
          avatarUri={conversation.avatar_url}
          isTwoPerson={settings.isTwoPerson}
        />

        <Text style={themedStyles.previewLabel}>PREVIEWING {selectedName.toUpperCase()}</Text>
        <Text style={themedStyles.sectionLabel}>CIRCLE THEME</Text>

        <View style={themedStyles.optionList}>
          {options.map((option, index) => {
            const selected = option.id === selectedThemeId;
            const optionThemeId = option.id === INHERIT_OPTION_ID
              ? globalThemeId
              : option.id;
            const optionTheme = getTheme(optionThemeId);

            return (
              <View key={option.id}>
                {index > 0 ? <View style={themedStyles.separator} /> : null}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setSelectedThemeId(option.id)}
                  style={({ pressed }) => [
                    themedStyles.optionRow,
                    selected && { backgroundColor: optionTheme.circle.accentSoft },
                    pressed && themedStyles.pressed,
                  ]}
                >
                  <View
                    style={[
                      themedStyles.optionMark,
                      {
                        backgroundColor: optionTheme.circle.accentSoft,
                        borderColor: optionTheme.circle.accent,
                      },
                    ]}
                  >
                    <View
                      style={[
                        themedStyles.optionMarkCore,
                        { backgroundColor: optionTheme.circle.accent },
                      ]}
                    />
                  </View>

                  <View style={themedStyles.optionCopy}>
                    <Text style={themedStyles.optionName}>{option.name}</Text>
                    <Text style={themedStyles.optionDescription}>{option.description}</Text>
                    <ThemePalette
                      themeId={option.id}
                      inheritedThemeId={globalThemeId}
                      selected={selected}
                    />
                  </View>

                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={selected ? optionTheme.circle.accent : theme.colors.subtext}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [
            themedStyles.saveButton,
            saving && themedStyles.disabled,
            pressed && !saving && themedStyles.pressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={theme.welcome.brandInk} />
          ) : (
            <Ionicons name="sparkles-outline" size={19} color={theme.welcome.brandInk} />
          )}
          <Text style={themedStyles.saveButtonText}>
            {saving ? 'Saving…' : `Apply ${selectedName}`}
          </Text>
        </Pressable>

        <View style={themedStyles.noteCard}>
          <Ionicons name="people-outline" size={20} color={theme.colors.text} />
          <Text style={themedStyles.noteText}>
            {settings.isTwoPerson
              ? 'Either person can update this shared look while Our Circle is open.'
              : 'Only Circle owners and admins can update the shared look.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function CustomizeCircleScreen({ route, navigation }) {
  const { conversationId } = route.params || {};
  const { themeId: globalThemeId, theme: globalTheme } = useTheme();
  const [conversation, setConversation] = useState(null);
  const [settings, setSettings] = useState(null);
  const [selectedThemeId, setSelectedThemeId] = useState(INHERIT_OPTION_ID);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError('');

    try {
      const [detailRows, themeSettings] = await Promise.all([
        getConversationDetails(conversationId),
        getCircleThemeSettings(conversationId),
      ]);

      if (!themeSettings.canCustomize) {
        throw new Error('Only Circle owners and admins can change this shared theme.');
      }

      setConversation(detailRows?.conversation || null);
      setSettings(themeSettings);
      setSelectedThemeId(themeSettings.themeId || INHERIT_OPTION_ID);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open Circle customization.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (!conversationId || saving) return;
    setSaving(true);

    try {
      await saveCircleTheme(
        conversationId,
        selectedThemeId === INHERIT_OPTION_ID ? null : selectedThemeId
      );
      navigation.goBack();
    } catch (saveError) {
      Alert.alert(
        'Circle theme not updated',
        saveError?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator color={globalTheme.circle.accent} />
      </SafeAreaView>
    );
  }

  if (error || !conversation || !settings) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={38} color={globalTheme.colors.text} />
        <Text style={[styles.errorText, { color: globalTheme.colors.text }]}>{error}</Text>
        <Pressable
          onPress={load}
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: globalTheme.circle.accent },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.retryText, { color: globalTheme.welcome.brandInk }]}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const previewThemeId = selectedThemeId === INHERIT_OPTION_ID
    ? globalThemeId
    : selectedThemeId;

  return (
    <ThemeScope themeId={previewThemeId}>
      <CustomizeCircleContent
        navigation={navigation}
        conversation={conversation}
        settings={settings}
        selectedThemeId={selectedThemeId}
        setSelectedThemeId={setSelectedThemeId}
        saving={saving}
        save={save}
        globalThemeId={globalThemeId}
        globalThemeName={globalTheme.name}
      />
    </ThemeScope>
  );
}

function createPreviewStyles(theme) {
  return StyleSheet.create({
    preview: {
      overflow: 'hidden',
      alignItems: 'center',
      marginTop: 20,
      paddingHorizontal: 20,
      paddingTop: 26,
      paddingBottom: 22,
      borderRadius: 26,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accent,
    },
    decal: {
      position: 'absolute',
      borderRadius: 999,
      opacity: 0.18,
    },
    decalOne: {
      width: 92,
      height: 92,
      top: -34,
      right: -18,
    },
    decalTwo: {
      width: 54,
      height: 54,
      top: 56,
      left: -20,
    },
    decalThree: {
      width: 72,
      height: 72,
      bottom: -34,
      right: 42,
    },
    previewTitle: {
      maxWidth: 280,
      marginTop: 10,
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 21,
      textAlign: 'center',
    },
    privateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    privateText: {
      color: theme.colors.subtext,
      fontFamily: theme.typography.semibold,
      fontSize: 10.5,
    },
    statRow: {
      width: '100%',
      maxWidth: 300,
      flexDirection: 'row',
      marginTop: 19,
    },
    stat: {
      flex: 1,
      alignItems: 'center',
    },
    statValue: {
      color: theme.circle.accent,
      fontFamily: theme.typography.bold,
      fontSize: 16,
    },
    statLabel: {
      marginTop: 1,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 10.5,
    },
    actionRow: {
      width: '100%',
      maxWidth: 300,
      flexDirection: 'row',
      gap: 8,
      marginTop: 17,
    },
    primaryAction: {
      flex: 1,
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: 12,
      backgroundColor: theme.circle.accent,
    },
    primaryActionText: {
      color: theme.welcome.brandInk,
      fontFamily: theme.typography.bold,
      fontSize: 12,
    },
    secondaryAction: {
      flex: 1,
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accent,
      backgroundColor: theme.circle.accentSoft,
    },
    secondaryActionText: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 12,
    },
  });
}

function createThemedStyles(theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.circle.profileBackground,
    },
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 48,
    },
    title: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 25,
      lineHeight: 32,
    },
    subtitle: {
      maxWidth: 620,
      marginTop: 8,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 13,
      lineHeight: 20,
    },
    previewLabel: {
      marginTop: 10,
      color: theme.circle.accent,
      fontFamily: theme.typography.bold,
      fontSize: 9.5,
      letterSpacing: 0.85,
      textAlign: 'center',
    },
    sectionLabel: {
      marginTop: 25,
      marginBottom: 8,
      marginLeft: 4,
      color: theme.colors.subtext,
      fontFamily: theme.typography.bold,
      fontSize: 10.5,
      letterSpacing: 0.8,
    },
    optionList: {
      overflow: 'hidden',
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    optionRow: {
      minHeight: 102,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    optionMark: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      borderWidth: 1,
    },
    optionMarkCore: {
      width: 19,
      height: 19,
      borderRadius: 999,
    },
    optionCopy: {
      flex: 1,
      marginHorizontal: 12,
    },
    optionName: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 14,
    },
    optionDescription: {
      marginTop: 3,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 11,
      lineHeight: 16,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 70,
      backgroundColor: theme.colors.border,
    },
    saveButton: {
      minHeight: 49,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      marginTop: 18,
      borderRadius: 15,
      backgroundColor: theme.circle.accent,
    },
    saveButtonText: {
      color: theme.welcome.brandInk,
      fontFamily: theme.typography.bold,
      fontSize: 14,
    },
    noteCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 14,
      padding: 14,
      borderRadius: 16,
      backgroundColor: theme.circle.accentSoft,
    },
    noteText: {
      flex: 1,
      color: theme.colors.text,
      fontFamily: theme.typography.regular,
      fontSize: 11.5,
      lineHeight: 17,
    },
    disabled: {
      opacity: 0.55,
    },
    pressed: {
      opacity: 0.72,
    },
  });
}

const styles = StyleSheet.create({
  paletteRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 8,
  },
  paletteDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#fff',
  },
  errorText: {
    maxWidth: 420,
    marginTop: 12,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  retryText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.72,
  },
});
