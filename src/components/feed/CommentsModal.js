import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import { Avatar } from '../Avatar';

function CommentsContent({
  comments,
  loading,
  error,
  commentText,
  sending,
  onChangeText,
  onSubmit,
  onRetry,
  onClose,
}) {
  const canSubmit = Boolean(commentText.trim()) && !sending;

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={styles.root}
    >
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close comments"
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="close"
            size={26}
            color={COLORS.text}
          />
        </Pressable>

        <Text style={styles.title}>Comments</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator />
            <Text style={styles.stateText}>Loading comments…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : comments.length ? (
          comments.map((comment) => (
            <View
              key={comment.id}
              style={[
                styles.commentRow,
                comment.pending && styles.pendingComment,
              ]}
            >
              <View style={styles.avatarWrap}>
                <Avatar
                  size={34}
                  name={comment.userName}
                  uri={comment.avatarUri}
                />
              </View>

              <View style={styles.commentTextWrap}>
                <Text style={styles.commentName}>
                  {comment.userName}
                </Text>
                <Text style={styles.commentBody}>
                  {comment.text}
                </Text>
                {comment.pending ? (
                  <Text style={styles.pendingText}>Sending…</Text>
                ) : null}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>
            No comments yet. Be the first to say something!
          </Text>
        )}
      </ScrollView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.composer}>
          <TextInput
            value={commentText}
            onChangeText={onChangeText}
            placeholder="Add a comment…"
            placeholderTextColor={COLORS.subtext}
            editable={!sending}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={canSubmit ? onSubmit : undefined}
          />

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.postButton,
              (!canSubmit || pressed) && styles.postButtonDisabled,
            ]}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function CommentsModal({
  visible,
  comments,
  loading,
  error,
  commentText,
  sending,
  onChangeText,
  onSubmit,
  onRetry,
  onClose,
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <CommentsContent
          comments={comments}
          loading={loading}
          error={error}
          commentText={commentText}
          sending={sending}
          onChangeText={onChangeText}
          onSubmit={onSubmit}
          onRetry={onRetry}
          onClose={onClose}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    minHeight: 56,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  headerSide: {
    width: 44,
    height: 44,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: COLORS.text,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 12,
    paddingBottom: 28,
  },
  centerState: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  retryButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  commentRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  pendingComment: {
    opacity: 0.65,
  },
  avatarWrap: {
    marginRight: 10,
  },
  commentTextWrap: {
    flex: 1,
  },
  commentName: {
    fontFamily: 'Manrope_700Bold',
    color: COLORS.text,
  },
  commentBody: {
    marginTop: 1,
    fontFamily: 'Manrope_400Regular',
    color: COLORS.text,
  },
  pendingText: {
    marginTop: 3,
    fontSize: 11,
    fontFamily: 'Manrope_400Regular',
    color: COLORS.subtext,
  },
  emptyText: {
    fontFamily: 'Manrope_400Regular',
    color: COLORS.subtext,
    textAlign: 'center',
    marginTop: 24,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontFamily: 'Manrope_400Regular',
    color: COLORS.text,
  },
  postButton: {
    minWidth: 66,
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  postButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  pressed: {
    opacity: 0.65,
  },
});
