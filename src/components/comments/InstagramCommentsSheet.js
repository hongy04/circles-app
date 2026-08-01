import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
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
import { useThemeTokens } from '../../theme/ThemeProvider';
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
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardFrame, setKeyboardFrame] = useState({ visible: false, height: 0 });
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
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      const screenY = Number(event?.endCoordinates?.screenY);
      const reportedHeight = Number(event?.endCoordinates?.height) || 0;
      const measuredHeight = Number.isFinite(screenY) ? Math.max(0, height - screenY) : reportedHeight;
      setKeyboardFrame({ visible: true, height: Math.max(reportedHeight, measuredHeight) });
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardFrame({ visible: false, height: 0 });
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [height]);

  const safeBottomInset = Math.max(
    insets.bottom || 0,
    initialWindowMetrics?.insets?.bottom || 0
  );
  const composerBottomInset = keyboardFrame.visible ? 8 : Math.max(14, safeBottomInset + 6);
  const closedSheetHeight = Math.min(Math.max(430, height * 0.82), 760);
  const keyboardLift = keyboardFrame.visible ? keyboardFrame.height : 0;
  const availableHeight = Math.max(260, height - keyboardLift - Math.max(8, insets.top + 8));
  const sheetHeight = keyboardFrame.visible
    ? Math.min(closedSheetHeight, availableHeight)
    : closedSheetHeight;
  const normalizedComments = useMemo(() => comments.filter(Boolean), [comments]);

  const closeSheet = () => {
    Keyboard.dismiss();
    onClose?.();
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || sending || !onSubmit) return;
    setSending(true);
    try {
      await onSubmit(body);
      setText('');
    } catch (submitError) {
      Alert.alert('Comment not posted', submitError?.message || 'Please try again.');
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
      onRequestClose={closeSheet}
    >
      <View style={styles.modalRoot}>
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />

        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              bottom: keyboardLift,
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
                {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
              </View>
              <Pressable
                onPress={closeSheet}
                hitSlop={10}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={theme.circle.accent} />
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
                    onOpenProfile={item.userId && onOpenProfile ? () => onOpenProfile(item.userId) : undefined}
                    onLongPress={item.canDelete && onDeleteComment ? () => deleteComment(item) : undefined}
                  />
                )}
                ListEmptyComponent={<InstagramCommentsEmpty title={emptyTitle} body={emptyBody} />}
                style={styles.commentsList}
                contentContainerStyle={styles.commentsContent}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="none"
                automaticallyAdjustContentInsets={false}
                automaticallyAdjustKeyboardInsets={false}
                contentInsetAdjustmentBehavior="never"
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
      </View>
    </Modal>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    modalRoot: { flex: 1 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,18,34,0.34)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      width: '100%',
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      overflow: 'hidden',
      shadowColor: theme.welcome.brandInk,
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -5 },
      elevation: 18,
    },
    safeSheet: { flex: 1, backgroundColor: theme.colors.surface },
    handle: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.circle.accentSoft,
      marginTop: 8,
      marginBottom: 4,
    },
    header: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.circle.accentSoft,
      paddingHorizontal: 8,
      backgroundColor: theme.colors.surface,
    },
    headerSide: { width: 42, height: 42 },
    headerTitleWrap: { flex: 1, alignItems: 'center' },
    headerTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 15 },
    headerSubtitle: { marginTop: 1, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 10 },
    closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
    commentsList: { flex: 1 },
    commentsContent: { flexGrow: 1, paddingVertical: 4, backgroundColor: theme.colors.surface },
    centerState: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center' },
    stateText: { marginTop: 8, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12 },
    pressed: { opacity: 0.55 },
  });
}
