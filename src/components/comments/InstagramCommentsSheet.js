import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import {
  InstagramCommentComposer,
  InstagramCommentRow,
  InstagramCommentsEmpty,
  InstagramCommentsError,
} from './InstagramComments';

export function InstagramCommentsSheet({
  visible,
  title = 'Comments',
  subtitle,
  comments = [],
  loading = false,
  error = '',
  onClose,
  onRetry,
  onSubmit,
  onOpenProfile,
  onDeleteComment,
  emptyTitle = 'No comments yet.',
  emptyBody = 'Start the conversation.',
  placeholder = 'Add a comment…',
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(height)).current;
  const listRef = useRef(null);

  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setText('');
      translateY.setValue(height);
      backdropOpacity.setValue(0);
      const frame = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            damping: 24,
            stiffness: 230,
            mass: 0.9,
            useNativeDriver: true,
          }),
        ]).start();
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!mountedRef.current) return undefined;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: height,
        duration: 190,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return undefined;
  }, [backdropOpacity, height, translateY, visible]);


  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const safeBottomInset = Math.max(
    insets.bottom || 0,
    initialWindowMetrics?.insets?.bottom || 0
  );
  const composerBottomInset = keyboardVisible
    ? 8
    : Math.max(14, safeBottomInset + 6);

  const normalizedComments = useMemo(() => comments.filter(Boolean), [comments]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending || !onSubmit) return;

    setSending(true);
    try {
      await onSubmit(body);
      setText('');
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd?.({ animated: true });
      });
    } catch (submitError) {
      Alert.alert(
        'Comment not posted',
        submitError?.message || 'Please try again.'
      );
    } finally {
      setSending(false);
    }
  };

  const deleteComment = (comment) => {
    if (!comment?.canDelete || !onDeleteComment) return;
    onDeleteComment(comment);
  };

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          style={[
            styles.sheet,
            {
              height: Math.min(Math.max(430, height * 0.82), 760),
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.safeSheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerSide} />
              <View style={styles.headerTitleWrap}>
                <Text style={styles.headerTitle}>{title}</Text>
                {subtitle ? (
                  <Text style={styles.headerSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator />
                <Text style={styles.stateText}>Loading comments…</Text>
              </View>
            ) : error ? (
              <InstagramCommentsError message={error} onRetry={onRetry} />
            ) : (
              <FlatList
                ref={listRef}
                data={normalizedComments}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <InstagramCommentRow
                    comment={item}
                    onOpenProfile={
                      item.userId && onOpenProfile
                        ? () => onOpenProfile(item.userId)
                        : undefined
                    }
                    onLongPress={
                      item.canDelete && onDeleteComment
                        ? () => deleteComment(item)
                        : undefined
                    }
                  />
                )}
                ListEmptyComponent={(
                  <InstagramCommentsEmpty
                    title={emptyTitle}
                    body={emptyBody}
                  />
                )}
                style={styles.commentsList}
                contentContainerStyle={styles.commentsContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
              />
            )}

            <InstagramCommentComposer
              value={text}
              onChangeText={setText}
              onSubmit={submit}
              sending={sending}
              placeholder={placeholder}
              bottomInset={composerBottomInset}
            />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.36)',
  },
  sheet: {
    width: '100%',
    minHeight: 430,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -5 },
    elevation: 18,
  },
  safeSheet: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#c7c7cc',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 8,
  },
  headerSide: {
    width: 42,
    height: 42,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  headerSubtitle: {
    marginTop: 1,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsList: {
    flex: 1,
  },
  commentsContent: {
    flexGrow: 1,
    paddingVertical: 4,
  },
  centerState: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    marginTop: 8,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  pressed: {
    opacity: 0.55,
  },
});
