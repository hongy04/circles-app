import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { Avatar } from '../../components/Avatar';
import { getConversationDetails } from '../../services/conversationService';
import {
  fetchCircleDecoration,
  saveCircleDecoration,
} from '../../services/circleDecorationService';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';

const BACKGROUND_PRESETS = [
  { id: 'sky', label: 'Sky', color: '#EAF8FF' },
  { id: 'mint', label: 'Mint', color: '#EFFAE8' },
  { id: 'blush', label: 'Blush', color: '#FFF0F3' },
  { id: 'lavender', label: 'Lavender', color: '#F3EEFF' },
  { id: 'sun', label: 'Sun', color: '#FFF7DF' },
  { id: 'mist', label: 'Mist', color: '#EDF2F6' },
];

async function requestPhotoPermission() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return true;

  Alert.alert(
    'Photo access needed',
    'Allow photo access to decorate this Circle with shared images.'
  );
  return false;
}

function PreviewIdentity({ conversation, headerUri, styles, theme }) {
  return (
    <View style={styles.previewIdentity}>
      {headerUri ? (
        <Image source={{ uri: headerUri }} resizeMode="cover" style={styles.previewHeaderPhoto} />
      ) : (
        <View style={styles.previewHeaderFallback}>
          <View style={[styles.previewDecal, styles.previewDecalOne, { backgroundColor: theme.circle.decalPalette[1] }]} />
          <View style={[styles.previewDecal, styles.previewDecalTwo, { backgroundColor: theme.circle.decalPalette[3] }]} />
        </View>
      )}

      <View style={styles.previewIdentityBody}>
        <View style={styles.previewAvatarWrap}>
          <Avatar
            size={64}
            name={conversation?.title || 'Circle'}
            uri={conversation?.avatar_url}
          />
        </View>
        <Text style={styles.previewTitle} numberOfLines={1}>
          {conversation?.title || 'Circle'}
        </Text>
        <View style={styles.previewPrivacyRow}>
          <Ionicons name="lock-closed" size={10} color={theme.colors.subtext} />
          <Text style={styles.previewPrivacyText}>
            {conversation?.kind === 'direct'
              ? 'Private to the two of you'
              : 'Invitation-only Circle'}
          </Text>
        </View>

        <View style={styles.previewCirclesRow}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.previewPostCircle} />
          ))}
        </View>
      </View>
    </View>
  );
}

function CustomizeCircleDecorationsContent({ route, navigation }) {
  const { conversationId } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('');
  const [error, setError] = useState('');

  const [existingHeaderPath, setExistingHeaderPath] = useState(null);
  const [headerUri, setHeaderUri] = useState(null);
  const [headerMimeType, setHeaderMimeType] = useState('image/jpeg');

  const [existingBackgroundPath, setExistingBackgroundPath] = useState(null);
  const [backgroundMode, setBackgroundMode] = useState('theme');
  const [backgroundUri, setBackgroundUri] = useState(null);
  const [backgroundMimeType, setBackgroundMimeType] = useState('image/jpeg');
  const [backgroundColor, setBackgroundColor] = useState(null);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError('');

    try {
      const [details, decoration] = await Promise.all([
        getConversationDetails(conversationId),
        fetchCircleDecoration(conversationId),
      ]);

      if (!decoration.canCustomize) {
        throw new Error('You do not have permission to change this Circle’s shared decorations.');
      }

      setConversation(details?.conversation || null);
      setExistingHeaderPath(decoration.circle_header_path || null);
      setHeaderUri(decoration.circle_header_url || null);
      setExistingBackgroundPath(decoration.circle_background_path || null);
      setBackgroundUri(decoration.circle_background_url || null);
      setBackgroundColor(decoration.circle_background_color || null);
      setBackgroundMode(
        decoration.circle_background_path
          ? 'image'
          : decoration.circle_background_color
            ? 'color'
            : 'theme'
      );
    } catch (loadError) {
      setError(loadError?.message || 'Could not load Circle decorations.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pickHeader = async () => {
    if (!(await requestPhotoPermission())) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.9,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    setHeaderUri(asset.uri);
    setHeaderMimeType(asset.mimeType || 'image/jpeg');
  };

  const pickBackground = async () => {
    if (!(await requestPhotoPermission())) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.88,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    setBackgroundMode('image');
    setBackgroundUri(asset.uri);
    setBackgroundMimeType(asset.mimeType || 'image/jpeg');
    setBackgroundColor(null);
  };

  const chooseThemeBackground = () => {
    setBackgroundMode('theme');
    setBackgroundUri(null);
    setBackgroundColor(null);
  };

  const chooseBackgroundColor = (color) => {
    setBackgroundMode('color');
    setBackgroundUri(null);
    setBackgroundColor(color);
  };

  const resetDecorations = () => {
    Alert.alert(
      `Reset ${conversation?.kind === 'direct' ? 'Our Circle' : 'Circle'} decorations?`,
      'The shared header photo and custom background will be removed. The Circle name, photo, theme, posts, and history stay unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setHeaderUri(null);
            chooseThemeBackground();
          },
        },
      ]
    );
  };

  const save = async () => {
    if (!conversationId || saving) return;
    setSaving(true);
    setSavePhase('Saving shared decorations…');

    try {
      await saveCircleDecoration({
        conversationId,
        headerUri,
        headerMimeType,
        existingHeaderPath,
        backgroundUri: backgroundMode === 'image' ? backgroundUri : null,
        backgroundMimeType,
        existingBackgroundPath,
        backgroundColor: backgroundMode === 'color' ? backgroundColor : null,
        onPhaseChange: setSavePhase,
      });
      navigation.goBack();
    } catch (saveError) {
      Alert.alert(
        'Could not save Circle decorations',
        saveError?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
      setSavePhase('');
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.stateText}>Loading shared decorations…</Text>
      </SafeAreaView>
    );
  }

  if (error || !conversation) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={38} color={theme.colors.text} />
        <Text style={styles.errorText}>{error || 'Circle unavailable.'}</Text>
        <Pressable onPress={load} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const previewBackgroundColor = backgroundMode === 'color'
    ? backgroundColor
    : theme.circle.profileBackground;
  const isTwoPerson = conversation.kind === 'direct';

  const preview = backgroundMode === 'image' && backgroundUri ? (
    <ImageBackground
      source={{ uri: backgroundUri }}
      resizeMode="cover"
      style={styles.previewBackground}
      imageStyle={styles.previewBackgroundImage}
    >
      <View style={styles.previewTint} />
      <PreviewIdentity conversation={conversation} headerUri={headerUri} styles={styles} theme={theme} />
    </ImageBackground>
  ) : (
    <View style={[styles.previewBackground, { backgroundColor: previewBackgroundColor }]}>
      <PreviewIdentity conversation={conversation} headerUri={headerUri} styles={styles} theme={theme} />
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>
          Decorate {isTwoPerson ? 'Our Circle' : 'this Circle'} together.
        </Text>
        <Text style={styles.subtitle}>
          The header and background belong to this shared space and are visible only to current Circle members.
        </Text>

        <View style={styles.previewShell}>{preview}</View>

        <Text style={styles.sectionLabel}>SHARED HEADER PHOTO</Text>
        <View style={styles.sectionCard}>
          <Pressable onPress={pickHeader} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.rowIcon}>
              <Ionicons name="image-outline" size={20} color={theme.colors.text} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{headerUri ? 'Replace header photo' : 'Choose header photo'}</Text>
              <Text style={styles.rowSubtitle}>A wide 3:1 image that gives the shared profile its own identity.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
          </Pressable>
          {headerUri ? (
            <>
              <View style={styles.separator} />
              <Pressable onPress={() => setHeaderUri(null)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.rowIcon}>
                  <Ionicons name="close-circle-outline" size={20} color="#B42318" />
                </View>
                <Text style={[styles.rowTitle, styles.removeText]}>Remove header photo</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>SHARED BACKGROUND</Text>
        <View style={styles.backgroundChoices}>
          <Pressable
            onPress={chooseThemeBackground}
            style={({ pressed }) => [
              styles.backgroundChoice,
              backgroundMode === 'theme' && styles.backgroundChoiceSelected,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.backgroundSwatch, { backgroundColor: theme.circle.profileBackground }]}>
              <Ionicons name="color-palette-outline" size={19} color={theme.colors.text} />
            </View>
            <Text style={styles.backgroundChoiceLabel}>Theme</Text>
          </Pressable>

          {BACKGROUND_PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() => chooseBackgroundColor(preset.color)}
              style={({ pressed }) => [
                styles.backgroundChoice,
                backgroundMode === 'color' && backgroundColor === preset.color && styles.backgroundChoiceSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.backgroundSwatch, { backgroundColor: preset.color }]} />
              <Text style={styles.backgroundChoiceLabel}>{preset.label}</Text>
            </Pressable>
          ))}

          <Pressable
            onPress={pickBackground}
            style={({ pressed }) => [
              styles.backgroundChoice,
              backgroundMode === 'image' && styles.backgroundChoiceSelected,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.backgroundSwatch, styles.photoSwatch]}>
              <Ionicons name="camera-outline" size={20} color={theme.colors.text} />
            </View>
            <Text style={styles.backgroundChoiceLabel}>{backgroundMode === 'image' ? 'Photo ✓' : 'Photo'}</Text>
          </Pressable>
        </View>

        <Text style={styles.backgroundNote}>
          Shared content stays on readable surfaces above the decoration. Uploaded images stay private and are delivered only to Circle members through expiring access.
        </Text>

        <View style={styles.permissionCard}>
          <Ionicons name="people-outline" size={20} color={theme.circle.accent} />
          <Text style={styles.permissionText}>
            {isTwoPerson
              ? 'Either person can update these decorations while Our Circle is open.'
              : 'Only Circle owners and admins can update these shared decorations.'}
          </Text>
        </View>

        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" color={theme.circle.accent} />
            <Text style={styles.savingText}>{savePhase}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [styles.saveButton, (pressed || saving) && styles.pressed]}
        >
          {saving ? (
            <ActivityIndicator color={theme.welcome.brandInk} />
          ) : (
            <Text style={styles.saveButtonText}>Save shared decorations</Text>
          )}
        </Pressable>

        <Pressable
          onPress={resetDecorations}
          disabled={saving}
          style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
        >
          <Text style={styles.resetButtonText}>Reset decorations</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function CustomizeCircleDecorationsScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CustomizeCircleDecorationsContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 48 },
    title: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 22,
      lineHeight: 28,
    },
    subtitle: {
      marginTop: 6,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 13,
      lineHeight: 19,
    },
    previewShell: {
      overflow: 'hidden',
      marginTop: 18,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accent,
      backgroundColor: theme.colors.surface,
    },
    previewBackground: { minHeight: 280 },
    previewBackgroundImage: { borderRadius: 22 },
    previewTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    previewIdentity: { flex: 1 },
    previewHeaderPhoto: { width: '100%', height: 92 },
    previewHeaderFallback: {
      overflow: 'hidden',
      width: '100%',
      height: 92,
      backgroundColor: theme.circle.accentSoft,
    },
    previewDecal: { position: 'absolute', borderRadius: 999, opacity: 0.22 },
    previewDecalOne: { width: 92, height: 92, right: -12, top: -28 },
    previewDecalTwo: { width: 58, height: 58, left: 20, bottom: -25 },
    previewIdentityBody: {
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingBottom: 18,
    },
    previewAvatarWrap: {
      marginTop: -31,
      padding: 3,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
    },
    previewTitle: {
      marginTop: 6,
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 17,
    },
    previewPrivacyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 3,
    },
    previewPrivacyText: {
      color: theme.colors.subtext,
      fontFamily: theme.typography.semibold,
      fontSize: 9.5,
    },
    previewCirclesRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 18,
    },
    previewPostCircle: {
      width: 58,
      height: 58,
      borderRadius: 29,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accent,
      backgroundColor: theme.colors.surfaceSoft,
    },
    sectionLabel: {
      marginTop: 24,
      marginBottom: 8,
      marginLeft: 4,
      color: theme.colors.subtext,
      fontFamily: theme.typography.bold,
      fontSize: 10.5,
      letterSpacing: 0.8,
    },
    sectionCard: {
      overflow: 'hidden',
      borderRadius: 17,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    row: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    rowIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      backgroundColor: theme.circle.accentSoft,
    },
    rowCopy: { flex: 1, marginHorizontal: 12 },
    rowTitle: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 14,
    },
    rowSubtitle: {
      marginTop: 3,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 11,
      lineHeight: 16,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 66,
      backgroundColor: theme.colors.border,
    },
    removeText: { color: '#B42318', marginLeft: 12 },
    backgroundChoices: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
    },
    backgroundChoice: {
      width: 76,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    backgroundChoiceSelected: {
      borderColor: theme.circle.accent,
      backgroundColor: theme.circle.accentSoft,
    },
    backgroundSwatch: {
      width: 54,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 17,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    photoSwatch: { backgroundColor: theme.colors.surfaceSoft },
    backgroundChoiceLabel: {
      marginTop: 5,
      color: theme.colors.text,
      fontFamily: theme.typography.semibold,
      fontSize: 10.5,
    },
    backgroundNote: {
      marginTop: 10,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 11,
      lineHeight: 16,
    },
    permissionCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 18,
      padding: 13,
      borderRadius: 15,
      backgroundColor: theme.circle.accentSoft,
    },
    permissionText: {
      flex: 1,
      color: theme.colors.text,
      fontFamily: theme.typography.regular,
      fontSize: 12,
      lineHeight: 18,
    },
    savingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 18,
    },
    savingText: {
      color: theme.colors.subtext,
      fontFamily: theme.typography.semibold,
      fontSize: 12,
    },
    saveButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
      borderRadius: 14,
      backgroundColor: theme.circle.accent,
    },
    saveButtonText: {
      color: theme.welcome.brandInk,
      fontFamily: theme.typography.bold,
      fontSize: 14,
    },
    resetButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    resetButtonText: {
      color: '#B42318',
      fontFamily: theme.typography.bold,
      fontSize: 13,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      backgroundColor: theme.circle.profileBackground,
    },
    stateText: {
      marginTop: 10,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 13,
    },
    errorText: {
      maxWidth: 420,
      marginTop: 12,
      color: theme.colors.text,
      fontFamily: theme.typography.semibold,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.circle.accent,
    },
    retryText: {
      color: theme.welcome.brandInk,
      fontFamily: theme.typography.bold,
      fontSize: 13,
    },
    pressed: { opacity: 0.72 },
  });
}
