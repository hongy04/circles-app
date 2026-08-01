import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import {
  createTwoPersonAlbum,
  getTwoPersonAlbum,
  updateTwoPersonAlbum,
} from '../../services/twoPersonAlbumService';
import { updateTwoPersonPlanMemoryAlbum } from '../../services/twoPersonPlanService';

function normalizeDate(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('Use YYYY-MM-DD for the date.');
  }
  const date = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    throw new Error('Enter a valid date.');
  }
  return trimmed;
}

function TwoPersonAlbumEditorContent({ route, navigation }) {
  const {
    albumId,
    conversationId,
    memoryPlanId,
    initialTitle = '',
    initialOccurredOn = '',
    initialNote = '',
    circleName = 'Our Circle',
  } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const editing = Boolean(albumId);
  const scrollRef = useRef(null);
  const fieldRefs = useRef({});
  const [title, setTitle] = useState(editing ? '' : initialTitle);
  const [occurredOn, setOccurredOn] = useState(editing ? '' : initialOccurredOn);
  const [note, setNote] = useState(editing ? '' : initialNote);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  const revealField = (key) => {
    const input = fieldRefs.current[key];
    if (!input || !scrollRef.current) return;
    requestAnimationFrame(() => {
      input.measureLayout(
        scrollRef.current,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 84), animated: true }),
        () => {}
      );
    });
  };

  const load = useCallback(async () => {
    if (!albumId) return;
    setLoading(true);
    try {
      const album = await getTwoPersonAlbum(albumId);
      setTitle(album.title || '');
      setOccurredOn(album.occurredOn || '');
      setNote(album.note || '');
    } catch (error) {
      Alert.alert('Could not open album', error?.message || 'Please try again.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [albumId, navigation]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const save = async () => {
    if (saving) return;
    try {
      const cleanTitle = title.trim();
      if (!cleanTitle) throw new Error('Give this album a title.');
      if (cleanTitle.length > 80) throw new Error('Keep the title under 80 characters.');
      if (note.trim().length > 500) throw new Error('Keep the note under 500 characters.');
      const dateValue = normalizeDate(occurredOn);

      setSaving(true);
      if (editing) {
        await updateTwoPersonAlbum({
          albumId,
          title: cleanTitle,
          note,
          occurredOn: dateValue,
        });
        navigation.goBack();
      } else {
        const createdAlbumId = await createTwoPersonAlbum({
          conversationId,
          title: cleanTitle,
          note,
          occurredOn: dateValue,
        });
        if (memoryPlanId) {
          await updateTwoPersonPlanMemoryAlbum(memoryPlanId, createdAlbumId);
          navigation.replace('TwoPersonAlbumDetail', {
            albumId: createdAlbumId,
            conversationId,
            circleName,
          });
        } else {
          navigation.goBack();
        }
      }
    } catch (error) {
      Alert.alert('Could not save album', error?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.center}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.centerText}>Opening album…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 92 : 0}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.content}
        >
          {memoryPlanId ? (
            <View style={styles.memoryCard}>
              <View style={styles.memoryIcon}>
                <Ionicons name="sparkles-outline" size={18} color={theme.colors.text} />
              </View>
              <Text style={styles.memoryText}>
                This album will be linked to the completed plan memory after you create it.
              </Text>
            </View>
          ) : null}

          <Text style={styles.label}>Title</Text>
          <TextInput
            ref={(node) => { fieldRefs.current.title = node; }}
            value={title}
            onChangeText={setTitle}
            onFocus={() => revealField('title')}
            placeholder="Weekend in Monterey"
            placeholderTextColor={theme.colors.subtext}
            maxLength={80}
            style={styles.input}
          />

          <Text style={styles.label}>Date (optional)</Text>
          <TextInput
            ref={(node) => { fieldRefs.current.date = node; }}
            value={occurredOn}
            onChangeText={setOccurredOn}
            onFocus={() => revealField('date')}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.subtext}
            autoCapitalize="none"
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            maxLength={10}
            style={styles.input}
          />

          <Text style={styles.label}>Shared note (optional)</Text>
          <TextInput
            ref={(node) => { fieldRefs.current.note = node; }}
            value={note}
            onChangeText={setNote}
            onFocus={() => revealField('note')}
            placeholder="What made this time special?"
            placeholderTextColor={theme.colors.subtext}
            multiline
            textAlignVertical="top"
            maxLength={500}
            style={[styles.input, styles.noteInput]}
          />
          <Text style={styles.counter}>{note.length}/500</Text>

          <Pressable
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || saving) && styles.pressed,
            ]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.saveButtonText}>{editing ? 'Save Changes' : 'Create Album'}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function TwoPersonAlbumEditorScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <TwoPersonAlbumEditorContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    content: { padding: 20, paddingBottom: 180 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.circle.profileBackground },
    centerText: { marginTop: 10, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
    memoryCard: {
      padding: 14,
      borderRadius: 15,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 4,
    },
    memoryIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: theme.circle.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memoryText: {
      flex: 1,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 12,
      lineHeight: 18,
    },
    label: {
      marginTop: 22,
      marginBottom: 7,
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
    },
    input: {
      minHeight: 48,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.colors.text,
      backgroundColor: theme.colors.surface,
      fontFamily: 'Manrope_400Regular',
      fontSize: 15,
    },
    noteInput: { minHeight: 130 },
    counter: {
      marginTop: 5,
      alignSelf: 'flex-end',
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 11,
    },
    saveButton: {
      marginTop: 26,
      minHeight: 48,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.welcome.brandInk,
    },
    saveButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 15 },
    pressed: { opacity: 0.65 },
  });
}
