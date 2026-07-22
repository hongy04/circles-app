import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import { timeAgo } from '../../utils/timeAgo';
import {
  InstagramCommentComposer,
  InstagramCommentRow,
  InstagramCommentsEmpty,
  InstagramCommentsError,
  InstagramCommentsLoading,
} from '../comments/InstagramComments';

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
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView
      edges={['top']}
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

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          {loading ? (
            <InstagramCommentsLoading />
          ) : error ? (
            <InstagramCommentsError
              message={error}
              onRetry={onRetry}
            />
          ) : comments.length ? (
            comments.map((comment) => (
              <InstagramCommentRow
                key={comment.id}
                comment={{
                  id: comment.id,
                  name: comment.userName,
                  avatarUri: comment.avatarUri,
                  body: comment.text,
                  timeLabel: comment.createdAt
                    ? timeAgo(comment.createdAt)
                    : '',
                  pending: comment.pending,
                }}
              />
            ))
          ) : (
            <InstagramCommentsEmpty />
          )}
        </ScrollView>

        <InstagramCommentComposer
          value={commentText}
          onChangeText={onChangeText}
          onSubmit={onSubmit}
          sending={sending}
          bottomInset={insets.bottom}
        />
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
  keyboardView: {
    flex: 1,
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
    paddingTop: 5,
    paddingBottom: 24,
  },
  pressed: {
    opacity: 0.65,
  },
});
