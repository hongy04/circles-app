import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '../../components/Avatar';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  fetchMyProfileDecoration,
  saveMyProfileDecoration,
} from '../../services/profileDecorationService';

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
    'Allow photo access to decorate your profile with your own images.'
  );
  return false;
}

export function CustomizeProfileScreen({ navigation }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('');

  const [existingHeaderPath, setExistingHeaderPath] = useState(null);
  const [headerUri, setHeaderUri] = useState(null);
  const [headerMimeType, setHeaderMimeType] = useState('image/jpeg');

  const [existingBackgroundPath, setExistingBackgroundPath] = useState(null);
  const [backgroundMode, setBackgroundMode] = useState('theme');
  const [backgroundUri, setBackgroundUri] = useState(null);
  const [backgroundMimeType, setBackgroundMimeType] = useState('image/jpeg');
  const [backgroundColor, setBackgroundColor] = useState(null);

  useEffect(() => {
    let mounted = true;

    fetchMyProfileDecoration()
      .then((result) => {
        if (!mounted) return;
        setProfile(result);
        setExistingHeaderPath(result.profile_header_path || null);
        setHeaderUri(result.profile_header_url || null);
        setExistingBackgroundPath(result.profile_background_path || null);
        setBackgroundUri(result.profile_background_url || null);
        setBackgroundColor(result.profile_background_color || null);
        setBackgroundMode(
          result.profile_background_path
            ? 'image'
            : result.profile_background_color
              ? 'color'
              : 'theme'
        );
      })
      .catch((error) => {
        Alert.alert(
          'Customization unavailable',
          error?.message || 'Please try again.'
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

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
      'Reset profile decorations?',
      'Your header photo and custom background will be removed. Your profile photo, name, bio, and app theme stay unchanged.',
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
    if (saving) return;
    setSaving(true);
    setSavePhase('Saving decorations…');

    try {
      await saveMyProfileDecoration({
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
    } catch (error) {
      Alert.alert(
        'Could not save decorations',
        error?.message || 'Please try again.'
      );
    } finally {
      setSaving(false);
      setSavePhase('');
    }
  };

  const previewBackgroundColor = backgroundMode === 'color'
    ? backgroundColor
    : theme.colors.bg;

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.centeredRoot}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading decorations…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.topBarSide}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Customize profile</Text>
        <Pressable
          onPress={save}
          disabled={saving}
          hitSlop={10}
          style={[styles.topBarSide, styles.topBarRight]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.text} />
          ) : (
            <Text style={styles.topBarSaveText}>Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.helperIntro}>
          Decorations are visible to you and accepted connections. People who have not connected with you still see the privacy-safe profile shell.
        </Text>

        <View style={styles.previewShell}>
          {backgroundMode === 'image' && backgroundUri ? (
            <ImageBackground
              source={{ uri: backgroundUri }}
              resizeMode="cover"
              style={styles.previewBackground}
              imageStyle={styles.previewBackgroundImage}
            >
              <View style={styles.backgroundTint} />
              <PreviewIdentity profile={profile} headerUri={headerUri} styles={styles} theme={theme} />
            </ImageBackground>
          ) : (
            <View style={[styles.previewBackground, { backgroundColor: previewBackgroundColor }]}>
              <PreviewIdentity profile={profile} headerUri={headerUri} styles={styles} theme={theme} />
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>HEADER PHOTO</Text>
        <View style={styles.sectionCard}>
          <Pressable onPress={pickHeader} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.rowIcon}>
              <Ionicons name="image-outline" size={20} color={theme.colors.text} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{headerUri ? 'Replace header photo' : 'Choose header photo'}</Text>
              <Text style={styles.rowSubtitle}>A wide 3:1 crop shown above your profile identity.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
          </Pressable>
          {headerUri ? (
            <>
              <View style={styles.separator} />
              <Pressable
                onPress={() => setHeaderUri(null)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="close-circle-outline" size={20} color="#B42318" />
                </View>
                <Text style={[styles.rowTitle, styles.removeText]}>Remove header photo</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>PROFILE BACKGROUND</Text>
        <View style={styles.backgroundChoices}>
          <Pressable
            onPress={chooseThemeBackground}
            style={({ pressed }) => [
              styles.backgroundChoice,
              backgroundMode === 'theme' && styles.backgroundChoiceSelected,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.backgroundSwatch, { backgroundColor: theme.colors.bg }]}>
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
          Profile content stays on readable surfaces above your background. Uploaded backgrounds are stored privately and delivered through expiring signed access.
        </Text>

        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" />
            <Text style={styles.savingText}>{savePhase}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [styles.saveButton, (pressed || saving) && styles.pressed]}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.onPrimary} />
          ) : (
            <Text style={styles.saveButtonText}>Save decorations</Text>
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

function PreviewIdentity({ profile, headerUri, styles, theme }) {
  return (
    <View style={styles.previewGlass}>
      {headerUri ? (
        <ImageBackground
          source={{ uri: headerUri }}
          resizeMode="cover"
          style={styles.previewHeader}
          imageStyle={styles.previewHeaderImage}
        >
          <View style={styles.previewHeaderFade} />
        </ImageBackground>
      ) : (
        <View style={[styles.previewHeader, styles.previewHeaderFallback]}>
          <View style={[styles.previewOrb, { backgroundColor: theme.circle.accentSoft }]} />
          <View style={[styles.previewOrb, styles.previewOrbTwo, { backgroundColor: theme.circle.accent }]} />
        </View>
      )}
      <View style={styles.previewIdentityRow}>
        <View style={styles.previewAvatarFrame}>
          <Avatar
            size={62}
            name={profile?.display_name || 'You'}
            uri={profile?.avatar_url || null}
          />
        </View>
        <View style={styles.previewText}>
          <Text style={styles.previewName} numberOfLines={1}>{profile?.display_name || 'Your profile'}</Text>
          <Text style={styles.previewUsername} numberOfLines={1}>
            {profile?.username ? `@${profile.username}` : 'Your decorated space'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.bg },
    centeredRoot: {
      flex: 1,
      backgroundColor: theme.colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      marginTop: 10,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
    },
    topBar: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.bg,
    },
    topBarSide: { width: 58, justifyContent: 'center' },
    topBarRight: { alignItems: 'flex-end' },
    topBarTitle: {
      flex: 1,
      textAlign: 'center',
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 16,
    },
    topBarSaveText: {
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
    },
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 46,
    },
    helperIntro: {
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 12.5,
      lineHeight: 19,
      marginBottom: 14,
    },
    previewShell: {
      borderRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 24,
      minHeight: 235,
    },
    previewBackground: {
      minHeight: 235,
      justifyContent: 'center',
      padding: 12,
    },
    previewBackgroundImage: { borderRadius: 23 },
    backgroundTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    previewGlass: {
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.88)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.92)',
    },
    previewHeader: { height: 96, overflow: 'hidden' },
    previewHeaderImage: { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
    previewHeaderFade: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(10,18,34,0.08)',
    },
    previewHeaderFallback: {
      backgroundColor: theme.circle.accentSoft,
    },
    previewOrb: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 60,
      right: -28,
      top: -54,
      opacity: 0.75,
    },
    previewOrbTwo: {
      width: 70,
      height: 70,
      borderRadius: 35,
      left: 22,
      top: 24,
      opacity: 0.16,
    },
    previewIdentityRow: {
      minHeight: 86,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingBottom: 12,
    },
    previewAvatarFrame: {
      width: 68,
      height: 68,
      borderRadius: 34,
      borderWidth: 3,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -28,
      backgroundColor: '#FFFFFF',
    },
    previewText: { flex: 1, marginLeft: 12 },
    previewName: {
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 17,
    },
    previewUsername: {
      marginTop: 2,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 12,
    },
    sectionLabel: {
      color: theme.colors.subtext,
      fontFamily: 'Manrope_700Bold',
      fontSize: 10.5,
      letterSpacing: 0.9,
      marginBottom: 8,
      marginTop: 4,
    },
    sectionCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
      marginBottom: 24,
    },
    row: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    rowIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.accentSoft,
    },
    rowCopy: { flex: 1, marginLeft: 11 },
    rowTitle: {
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
    },
    rowSubtitle: {
      marginTop: 2,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 11,
      lineHeight: 16,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 63,
      backgroundColor: theme.colors.border,
    },
    removeText: { marginLeft: 11, color: '#B42318' },
    backgroundChoices: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 10,
    },
    backgroundChoice: {
      width: '22%',
      minWidth: 72,
      borderRadius: 14,
      padding: 7,
      borderWidth: 1.5,
      borderColor: 'transparent',
      alignItems: 'center',
    },
    backgroundChoiceSelected: {
      borderColor: theme.circle.accent,
      backgroundColor: theme.circle.accentSoft,
    },
    backgroundSwatch: {
      width: 48,
      height: 48,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoSwatch: { backgroundColor: theme.colors.surface },
    backgroundChoiceLabel: {
      marginTop: 5,
      color: theme.colors.text,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 9.5,
      textAlign: 'center',
    },
    backgroundNote: {
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 11,
      lineHeight: 17,
      marginBottom: 22,
    },
    savingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 10,
    },
    savingText: {
      color: theme.colors.subtext,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 11,
    },
    saveButton: {
      minHeight: 50,
      borderRadius: 15,
      backgroundColor: theme.circle.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonText: {
      color: theme.colors.onPrimary,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13.5,
    },
    resetButton: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    resetButtonText: {
      color: theme.colors.subtext,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    pressed: { opacity: 0.65 },
  });
}
