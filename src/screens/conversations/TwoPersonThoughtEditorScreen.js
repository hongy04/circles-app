import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  createTwoPersonThoughtDraft,
  deleteTwoPersonThought,
  getTwoPersonThought,
  shareTwoPersonThought,
  updateTwoPersonThoughtDraft,
} from '../../services/twoPersonThoughtService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';

function Field({ label, hint, children, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function TwoPersonThoughtEditorContent({ route, navigation }) {
  const {
    conversationId,
    circleName = 'Our Circle',
    thoughtId = null,
  } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cachedThought = thoughtId
    ? readNavigationCache(navigationCacheKeys.thought(thoughtId))
    : null;
  const cachedDraft = cachedThought?.status === 'draft' && cachedThought?.isAuthor
    ? cachedThought
    : null;
  const [title, setTitle] = useState(cachedDraft?.title || '');
  const [body, setBody] = useState(cachedDraft?.body || '');
  const [loading, setLoading] = useState(Boolean(thoughtId && !cachedDraft));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const keepFieldVisible = (event) => {
    const target = event?.nativeEvent?.target;
    if (!target) return;
    setTimeout(() => {
      const responder = scrollRef.current?.getScrollResponder?.();
      responder?.scrollResponderScrollNativeHandleToKeyboard?.(target, 24, true);
    }, Platform.OS === 'ios' ? 120 : 180);
  };

  useEffect(() => {
    let active = true;
    if (!thoughtId) return () => { active = false; };

    (async () => {
      try {
        const thought = await getTwoPersonThought(thoughtId);
        if (!active) return;
        if (thought.status !== 'draft' || !thought.isAuthor) {
          navigation.replace('TwoPersonThoughtDetail', {
            conversationId,
            circleName,
            thoughtId,
          });
          return;
        }
        setTitle(thought.title);
        setBody(thought.body);
        writeNavigationCache(navigationCacheKeys.thought(thoughtId), thought);
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not open this draft.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [circleName, conversationId, navigation, thoughtId]);

  const validate = () => {
    const cleanBody = body.trim();
    if (!cleanBody) {
      Alert.alert('Write something first', 'Your thought needs at least one word before it can be saved.');
      return false;
    }
    return true;
  };

  const persistDraft = async () => {
    if (!validate()) return null;
    if (thoughtId) {
      await updateTwoPersonThoughtDraft({ thoughtId, title, body });
      return thoughtId;
    }
    return createTwoPersonThoughtDraft({ conversationId, title, body });
  };

  const save = async () => {
    if (working || !validate()) return;
    setWorking(true);
    setError('');
    try {
      await persistDraft();
      navigation.goBack();
    } catch (saveError) {
      setError(saveError?.message || 'Could not save this private draft.');
    } finally {
      setWorking(false);
    }
  };

  const confirmShare = () => {
    if (working || !validate()) return;
    Alert.alert(
      'Share this thought?',
      'The other person will be able to read it. Once shared, it becomes read-only so its meaning cannot be silently changed.',
      [
        { text: 'Keep Private', style: 'cancel' },
        {
          text: 'Share with Our Circle',
          onPress: async () => {
            setWorking(true);
            setError('');
            try {
              const nextThoughtId = await persistDraft();
              if (!nextThoughtId) return;
              await shareTwoPersonThought(nextThoughtId);
              navigation.replace('TwoPersonThoughtDetail', {
                conversationId,
                circleName,
                thoughtId: nextThoughtId,
              });
            } catch (shareError) {
              setError(shareError?.message || 'Could not share this thought.');
            } finally {
              setWorking(false);
            }
          },
        },
      ]
    );
  };

  const remove = () => {
    if (!thoughtId || working) return;
    Alert.alert(
      'Remove this private draft?',
      'This permanently removes the draft. The other person has never been able to see it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Draft',
          style: 'destructive',
          onPress: async () => {
            setWorking(true);
            setError('');
            try {
              await deleteTwoPersonThought(thoughtId);
              navigation.goBack();
            } catch (removeError) {
              setError(removeError?.message || 'Could not remove this draft.');
              setWorking(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.stateText}>Opening private draft…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.privateCard}>
            <View style={styles.privateIcon}>
              <Ionicons name="lock-closed-outline" size={19} color={theme.colors.text} />
            </View>
            <View style={styles.privateCopy}>
              <Text style={styles.privateTitle}>Private until you share</Text>
              <Text style={styles.privateBody}>
                This draft is visible only to you inside {circleName}. Save it, leave, and return whenever you are ready.
              </Text>
            </View>
          </View>

          <Field label="Title" hint="Optional · a short name for the letter or reflection." styles={styles}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Something I want to tell you"
              placeholderTextColor={theme.colors.subtext}
              maxLength={120}
              onFocus={keepFieldVisible}
              style={styles.input}
            />
          </Field>

          <Field label="Your thought" hint={`${body.length}/6000 characters`} styles={styles}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Write freely. Nothing is shared until you choose to share it."
              placeholderTextColor={theme.colors.subtext}
              maxLength={6000}
              multiline
              textAlignVertical="top"
              onFocus={keepFieldVisible}
              style={[styles.input, styles.bodyInput]}
            />
          </Field>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            disabled={working}
            onPress={save}
            style={({ pressed }) => [
              styles.secondaryButton,
              working && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="lock-closed-outline" size={17} color={theme.colors.text} />
            <Text style={styles.secondaryButtonText}>Save Private Draft</Text>
          </Pressable>

          <Pressable
            disabled={working}
            onPress={confirmShare}
            style={({ pressed }) => [
              styles.primaryButton,
              working && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {working ? <ActivityIndicator color="#fff" /> : (
              <Ionicons name="paper-plane-outline" size={17} color="#fff" />
            )}
            <Text style={styles.primaryButtonText}>Share with Our Circle</Text>
          </Pressable>

          {thoughtId ? (
            <Pressable
              disabled={working}
              onPress={remove}
              style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
            >
              <Text style={styles.removeButtonText}>Remove Private Draft</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function TwoPersonThoughtEditorScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <TwoPersonThoughtEditorContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    keyboardView: { flex: 1 },
    content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 160 },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.profileBackground,
      gap: 10,
    },
    stateText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    privateCard: {
      padding: 14,
      borderRadius: 15,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    privateIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: theme.circle.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    privateCopy: { flex: 1 },
    privateTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    privateBody: {
      marginTop: 3,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 11.5,
      lineHeight: 17,
    },
    field: { marginTop: 18 },
    label: { marginBottom: 7, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    hint: {
      marginTop: 6,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 10.5,
      lineHeight: 15,
    },
    input: {
      minHeight: 46,
      paddingHorizontal: 13,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      color: theme.colors.text,
      fontFamily: 'Manrope_400Regular',
      fontSize: 14,
    },
    bodyInput: { minHeight: 260, lineHeight: 21 },
    errorText: { marginTop: 14, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    secondaryButton: {
      marginTop: 20,
      minHeight: 47,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    secondaryButtonText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
    primaryButton: {
      marginTop: 10,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: theme.welcome.brandInk,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    primaryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
    removeButton: { marginTop: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    removeButtonText: { color: '#b42318', fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
    disabled: { opacity: 0.55 },
    pressed: { opacity: 0.72 },
  });
}
