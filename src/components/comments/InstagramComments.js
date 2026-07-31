import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Avatar } from '../Avatar';
import { useThemeTokens } from '../../theme/ThemeProvider';

export function InstagramCommentRow({
  comment,
  onOpenProfile,
  onLongPress,
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const metadata = [
    comment.timeLabel,
    comment.edited ? 'Edited' : null,
    comment.pending ? 'Sending…' : null,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={360}
      style={({ pressed }) => [
        styles.commentRow,
        pressed && onLongPress && styles.pressed,
      ]}
    >
      <Pressable
        onPress={onOpenProfile}
        disabled={!onOpenProfile}
        hitSlop={6}
        style={styles.avatarButton}
      >
        <Avatar
          size={34}
          name={comment.name || 'Someone'}
          uri={comment.avatarUri || null}
        />
      </Pressable>

      <View style={styles.commentContent}>
        <Text style={styles.commentText}>
          <Text onPress={onOpenProfile} style={styles.commentName}>
            {comment.name || 'Someone'}{' '}
          </Text>
          {comment.body}
        </Text>

        {metadata ? <Text style={styles.commentMeta}>{metadata}</Text> : null}
      </View>
    </Pressable>
  );
}

export function InstagramCommentsEmpty({
  title = 'No comments yet.',
  body = 'Start the conversation.',
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>○</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function InstagramCommentsLoading({ label = 'Loading comments…' }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={theme.circle.accent} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function InstagramCommentsError({ message, onRetry }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.errorState}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function InstagramCommentComposer({
  value,
  onChangeText,
  onSubmit,
  sending = false,
  placeholder = 'Add a comment…',
  bottomInset = 8,
  inputRef,
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const canSubmit = Boolean(value.trim()) && !sending;

  return (
    <View style={[
      styles.composer,
      { paddingBottom: Math.max(8, bottomInset) },
    ]}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        editable={!sending}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.subtext}
        multiline
        maxLength={1000}
        textAlignVertical="center"
        style={styles.input}
      />

      <Pressable
        onPress={onSubmit}
        disabled={!canSubmit}
        hitSlop={8}
        style={({ pressed }) => [
          styles.postButton,
          (!canSubmit || pressed) && styles.postButtonDisabled,
        ]}
      >
        {sending ? (
          <ActivityIndicator size="small" color={theme.circle.accent} />
        ) : (
          <Text style={styles.postButtonText}>Post</Text>
        )}
      </Pressable>
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    commentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 9,
      backgroundColor: theme.colors.surface,
    },
    avatarButton: { marginRight: 10 },
    commentContent: { flex: 1, paddingTop: 1 },
    commentText: {
      color: theme.colors.text,
      fontFamily: 'Manrope_400Regular',
      fontSize: 13,
      lineHeight: 18,
    },
    commentName: {
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
    },
    commentMeta: {
      marginTop: 4,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 10,
    },
    emptyState: {
      alignItems: 'center',
      paddingHorizontal: 28,
      paddingVertical: 34,
    },
    emptyIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
      backgroundColor: theme.circle.accentSoft,
    },
    emptyIconText: {
      color: theme.circle.accent,
      fontFamily: 'Manrope_700Bold',
      fontSize: 24,
      lineHeight: 26,
    },
    emptyTitle: {
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
    },
    emptyBody: {
      marginTop: 4,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
    },
    loadingState: {
      minHeight: 120,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    loadingText: {
      marginTop: 8,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 12,
    },
    errorState: {
      alignItems: 'center',
      paddingHorizontal: 28,
      paddingVertical: 28,
    },
    errorText: {
      color: theme.colors.text,
      fontFamily: 'Manrope_400Regular',
      fontSize: 12,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 9,
      backgroundColor: theme.welcome.brandInk,
    },
    retryText: {
      color: '#fff',
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 10,
      paddingTop: 9,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.circle.accentSoft,
      backgroundColor: theme.colors.surface,
    },
    input: {
      flex: 1,
      minHeight: 38,
      maxHeight: 104,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingTop: 9,
      paddingBottom: 9,
      color: theme.colors.text,
      fontFamily: 'Manrope_400Regular',
      fontSize: 14,
      backgroundColor: theme.colors.surfaceSoft,
    },
    postButton: {
      minWidth: 48,
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    postButtonDisabled: { opacity: 0.42 },
    postButtonText: {
      color: theme.circle.accent,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
    },
    pressed: { opacity: 0.65 },
  });
}
