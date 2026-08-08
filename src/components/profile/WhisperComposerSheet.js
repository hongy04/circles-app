import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { WHISPER_MAX_CHARACTERS } from '../../services/whisperService';

function WhisperGlyph({ color, size = 24 }) {
  return (
    <View style={[styles.glyphRoot, { width: size + 8, height: size + 8 }]}>
      <Ionicons name="ear-outline" size={size} color={color} />
      <View style={[styles.glyphBubble, styles.glyphBubbleLarge, { borderColor: color }]} />
      <View style={[styles.glyphBubble, styles.glyphBubbleSmall, { borderColor: color }]} />
    </View>
  );
}

export function WhisperComposerSheet({
  visible,
  profile,
  onClose,
  onSend,
}) {
  const theme = useThemeTokens();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const displayName = profile?.display_name || 'this connection';
  const firstName = displayName.trim().split(/\s+/)[0] || 'them';
  const cleanBody = body.trim();
  const canSend = cleanBody.length > 0 && cleanBody.length <= WHISPER_MAX_CHARACTERS && !busy && !sent;

  useEffect(() => {
    if (!visible) {
      setBody('');
      setBusy(false);
      setSent(false);
    }
  }, [visible]);

  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      await onSend?.(cleanBody);
      setSent(true);
      setTimeout(() => onClose?.(), 650);
    } catch (error) {
      setBusy(false);
      Alert.alert('Whisper not sent', error?.message || 'Please try again.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={busy ? undefined : onClose}
    >
      <SafeAreaProvider>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.root}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={busy ? undefined : onClose}
            accessibilityRole="button"
            accessibilityLabel="Close Whisper composer"
          />
          <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
            <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.handle} />

              {sent ? (
                <View style={styles.sentState}>
                  <View style={[styles.sentIcon, { backgroundColor: theme.colors.surfaceSoft }]}>
                    <Ionicons name="sparkles-outline" size={25} color={theme.colors.text} />
                  </View>
                  <Text style={[styles.sentTitle, { color: theme.colors.text }]}>Whisper sent</Text>
                  <Text style={[styles.sentBody, { color: theme.colors.subtext }]}>It’s floating over to {firstName}.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.headingRow}>
                    <View style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceSoft }]}>
                      <WhisperGlyph color={theme.colors.text} />
                    </View>
                    <View style={styles.headingCopy}>
                      <Text style={[styles.title, { color: theme.colors.text }]}>Whisper to {firstName}</Text>
                      <Text style={[styles.body, { color: theme.colors.subtext }]}>A small note that disappears after 24 hours, or when they read it.</Text>
                    </View>
                  </View>

                  <View style={[styles.inputWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSoft }]}>
                    <TextInput
                      value={body}
                      onChangeText={setBody}
                      placeholder="Leave a whisper…"
                      placeholderTextColor={theme.colors.subtext}
                      maxLength={WHISPER_MAX_CHARACTERS}
                      multiline
                      autoFocus
                      textAlignVertical="top"
                      editable={!busy}
                      accessibilityLabel={`Whisper to ${firstName}`}
                      style={[styles.input, { color: theme.colors.text }]}
                    />
                    <Text style={[styles.count, { color: theme.colors.subtext }]}>
                      {body.length}/{WHISPER_MAX_CHARACTERS}
                    </Text>
                  </View>

                  <View style={styles.actions}>
                    <Pressable
                      onPress={onClose}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.cancelButton,
                        { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSoft },
                        pressed && !busy && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.cancelText, { color: theme.colors.text }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={submit}
                      disabled={!canSend}
                      style={({ pressed }) => [
                        styles.sendButton,
                        { backgroundColor: theme.circle.accent },
                        pressed && canSend && styles.pressed,
                        !canSend && styles.disabled,
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                      ) : (
                        <>
                          <Ionicons name="paper-plane-outline" size={17} color={theme.colors.onPrimary} />
                          <Text style={[styles.sendText, { color: theme.colors.onPrimary }]}>Send Whisper</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10,18,34,0.22)',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    shadowColor: '#0A1222',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: 'rgba(90,100,120,0.28)',
    marginBottom: 16,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headingCopy: {
    flex: 1,
  },
  title: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  body: {
    marginTop: 3,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  inputWrap: {
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    minHeight: 132,
    overflow: 'hidden',
  },
  input: {
    minHeight: 104,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 8,
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    lineHeight: 21,
  },
  count: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 10,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10.5,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  cancelButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: 'Manrope_700Bold',
  },
  sendButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 16,
  },
  sendText: {
    fontFamily: 'Manrope_700Bold',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.42,
  },
  sentState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  sentIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentTitle: {
    marginTop: 12,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  sentBody: {
    marginTop: 4,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12.5,
  },
  glyphRoot: {
    position: 'relative',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  glyphBubble: {
    position: 'absolute',
    borderWidth: 1.2,
    backgroundColor: 'transparent',
  },
  glyphBubbleLarge: {
    width: 7,
    height: 7,
    borderRadius: 4,
    right: 1,
    top: 4,
  },
  glyphBubbleSmall: {
    width: 4,
    height: 4,
    borderRadius: 2,
    right: 0,
    top: 14,
  },
});
