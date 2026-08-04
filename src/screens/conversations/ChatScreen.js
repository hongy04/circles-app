import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  AppState,
  Alert,
  FlatList,
  Image,
  Keyboard,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../theme/colors';
import { ConversationHeaderTitle } from '../../components/conversations/ConversationHeaderTitle';
import { ContinuityLoadingCard } from '../../components/ContinuityLoadingCard';
import { ThemeAtmosphere } from '../../components/ThemeAtmosphere';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { getTheme } from '../../theme/themes';
import { getCircleThemeSettings } from '../../services/circleThemeService';
import {
  deleteOwnConversationMessage,
  getConversationDetails,
  getCurrentConversationUser,
  listConversationMessages,
  markConversationRead,
  sendConversationMessage,
  subscribeToConversationChanges,
} from '../../services/conversationService';
import {
  openRomanticFocusReveal,
  openRomanticMutualReveal,
} from '../../services/romanticService';
import {
  removeConversationMedia,
  uploadConversationAsset,
} from '../../services/conversationMediaService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';
import { reconcileRowsById } from '../../utils/reconcileRows';

const MAX_ATTACHMENTS = 6;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_DURATION_MS = 30 * 1000;
const CHAT_FOCUS_FRESH_MS = 12_000;
const CHAT_REALTIME_DEBOUNCE_MS = 180;

function MutualInterestRevealModal({ visible, onContinue }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onContinue}
    >
      <View style={styles.mutualModalBackdrop}>
        <View style={styles.mutualModalCard}>
          <View style={styles.mutualMark}>
            <View style={styles.mutualMarkOuter}>
              <View style={styles.mutualMarkInner}>
                <Ionicons name="heart" size={30} color={COLORS.text} />
              </View>
            </View>
          </View>
          <Text style={styles.mutualModalTitle}>The interest is mutual.</Text>
          <Text style={styles.mutualModalBody}>
            Keep getting to know each other. When you are both ready, you can choose what comes next.
          </Text>
          <Pressable
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue chatting"
            style={({ pressed }) => [
              styles.mutualContinueButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.mutualContinueText}>Continue chatting</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function MutualFocusRevealModal({ visible, onContinue }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onContinue}
    >
      <View style={styles.mutualModalBackdrop}>
        <View style={[styles.mutualModalCard, styles.focusModalCard]}>
          <View style={styles.mutualMark}>
            <View style={styles.mutualMarkOuter}>
              <View style={[styles.mutualMarkInner, styles.focusMarkInner]}>
                <Ionicons name="infinite" size={32} color={COLORS.text} />
              </View>
            </View>
          </View>
          <Text style={styles.mutualModalTitle}>You’re focusing on each other.</Text>
          <Text style={styles.mutualModalBody}>
            Romantic discovery with other connections is now paused while you give this connection a real chance. Your friendships and messages remain unchanged.
          </Text>
          <Pressable
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue chatting"
            style={({ pressed }) => [
              styles.mutualContinueButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.mutualContinueText}>Continue chatting</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatReadStatus(message, isGroup) {
  const readCount = Number(message?.readCount || 0);
  const recipientCount = Number(message?.recipientCount || 0);

  if (readCount <= 0) return 'Not read';
  if (!isGroup) return 'Read';
  if (recipientCount > 0 && readCount >= recipientCount) return 'Read by all';
  return `Read by ${readCount}`;
}

function normalizeAsset(asset) {
  return {
    id: asset.assetId || `${asset.uri}-${Date.now()}-${Math.random()}`,
    uri: asset.uri,
    mediaType: asset.type === 'video' ? 'video' : 'image',
    mimeType:
      asset.mimeType
      || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    width: asset.width || null,
    height: asset.height || null,
    durationMs: asset.duration || null,
    fileSize: asset.fileSize || null,
  };
}

function validateAssets(assets) {
  if (assets.length > MAX_ATTACHMENTS) {
    return `Choose up to ${MAX_ATTACHMENTS} photos or videos per message.`;
  }

  const tooLarge = assets.find(
    (asset) => asset.fileSize && asset.fileSize > MAX_FILE_BYTES
  );
  if (tooLarge) return 'Each attachment must be 25 MB or smaller.';

  const tooLong = assets.find(
    (asset) =>
      asset.mediaType === 'video'
      && asset.durationMs
      && asset.durationMs > MAX_VIDEO_DURATION_MS
  );
  if (tooLong) return 'Videos must be 30 seconds or shorter.';

  return null;
}

function SelectedMedia({ assets, onRemove, disabled }) {
  if (!assets.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.selectedMediaRow}
      keyboardShouldPersistTaps="handled"
    >
      {assets.map((asset) => (
        <View key={asset.id} style={styles.selectedTile}>
          {asset.mediaType === 'image' ? (
            <Image source={{ uri: asset.uri }} style={styles.selectedImage} />
          ) : (
            <View style={styles.selectedVideo}>
              <Ionicons name="videocam" size={25} color="#fff" />
            </View>
          )}
          <Pressable
            onPress={() => onRemove(asset.id)}
            disabled={disabled}
            style={styles.removeAttachment}
          >
            <Ionicons name="close" size={14} color="#fff" />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function MessageMediaGrid({ items, onOpen, onLongPress }) {
  const lastLongPressAtRef = useRef(0);

  if (!items?.length) return null;

  const displayItems = items.slice(0, 6);
  const tileWidth = displayItems.length === 1 ? 242 : 119;
  const tileHeight = displayItems.length === 1 ? 242 : 119;

  return (
    <View style={[
      styles.messageMediaGrid,
      displayItems.length === 1 && styles.singleMediaGrid,
    ]}>
      {displayItems.map((item, index) => (
        <Pressable
          key={item.id}
          onPress={() => {
            if (Date.now() - lastLongPressAtRef.current < 800) return;
            onOpen(index);
          }}
          onLongPress={onLongPress ? () => {
            lastLongPressAtRef.current = Date.now();
            onLongPress();
          } : undefined}
          delayLongPress={360}
          style={({ pressed }) => [
            styles.messageMediaTile,
            { width: tileWidth, height: tileHeight },
            pressed && styles.pressed,
          ]}
        >
          {item.mediaType === 'image' ? (
            <Image source={{ uri: item.url }} style={styles.messageMediaImage} />
          ) : (
            <View style={styles.messageVideoTile}>
              <Ionicons name="play-circle" size={42} color="#fff" />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}


function sameChatMedia(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  if (a.length !== b.length) return false;

  return a.every((item, index) => {
    const other = b[index];
    return item?.id === other?.id
      && item?.url === other?.url
      && item?.storagePath === other?.storagePath
      && item?.mediaType === other?.mediaType
      && item?.width === other?.width
      && item?.height === other?.height
      && item?.durationMs === other?.durationMs
      && item?.sortOrder === other?.sortOrder;
  });
}

function sameChatMessage(left, right) {
  return left?.id === right?.id
    && left?.senderId === right?.senderId
    && left?.senderName === right?.senderName
    && left?.senderAvatar === right?.senderAvatar
    && left?.body === right?.body
    && left?.createdAt === right?.createdAt
    && left?.readCount === right?.readCount
    && left?.recipientCount === right?.recipientCount
    && sameChatMedia(left?.media, right?.media);
}

const ChatMessageRow = React.memo(function ChatMessageRow({
  item,
  currentUserId,
  isGroup,
  isDeleting,
  onShowActions,
  onOpenMedia,
}) {
  const mine = item.senderId === currentUserId;
  const hasText = Boolean(item.body);
  const hasMedia = item.media?.length > 0;
  const readStatus = mine ? formatReadStatus(item, isGroup) : '';
  const canUnsend = mine && Number(item.readCount || 0) === 0;

  return (
    <Pressable
      onLongPress={() => onShowActions(item)}
      delayLongPress={360}
      disabled={!mine || isDeleting}
      accessibilityRole="button"
      accessibilityLabel={mine ? 'Your message' : `${item.senderName}'s message`}
      accessibilityHint={mine
        ? (canUnsend
          ? 'Press and hold to unsend before anyone reads it.'
          : 'This message has already been read and cannot be unsent.')
        : undefined}
      style={styles.messageWrap}
    >
      {!mine && isGroup ? (
        <Text style={styles.senderName}>{item.senderName}</Text>
      ) : null}

      <View style={[
        styles.messageContent,
        mine ? styles.mineContent : styles.otherContent,
      ]}>
        {hasMedia ? (
          <MessageMediaGrid
            items={item.media}
            onOpen={(index) => onOpenMedia(item, index)}
            onLongPress={mine ? () => onShowActions(item) : undefined}
          />
        ) : null}

        {hasText ? (
          <View style={[
            styles.bubble,
            mine ? styles.mineBubble : styles.otherBubble,
            hasMedia && styles.textWithMedia,
          ]}>
            <Text style={[
              styles.messageText,
              mine ? styles.mineText : styles.otherText,
            ]}>
              {item.body}
            </Text>
          </View>
        ) : null}

        {isDeleting ? (
          <ActivityIndicator size="small" style={styles.deletingIndicator} />
        ) : null}
      </View>

      <Text style={[
        styles.messageTime,
        mine ? styles.mineTime : styles.otherTime,
      ]}>
        {formatTime(item.createdAt)}
        {mine && readStatus ? ` · ${readStatus}` : ''}
      </Text>
    </Pressable>
  );
});

export function ChatScreen({ route, navigation }) {
  const {
    conversationId,
    name = 'Conversation',
    kind = 'direct',
    avatarUri: initialAvatarUri = null,
    otherUserId: initialOtherUserId = null,
    isCircle: initialIsCircle = kind === 'group',
  } = route.params || {};

  const insets = useSafeAreaInsets();
  const globalTheme = useThemeTokens();
  const listRef = useRef(null);
  const screenFocusedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState || 'active');
  const cachedChat = readNavigationCache(navigationCacheKeys.chat(conversationId));
  const cachedDetails = readNavigationCache(navigationCacheKeys.conversationDetails(conversationId));
  const routeConversation = {
    title: name,
    kind,
    avatar_url: initialAvatarUri,
    other_user_id: initialOtherUserId,
    is_circle: initialIsCircle,
  };
  const [conversation, setConversation] = useState(
    cachedChat?.conversation || cachedDetails?.conversation || routeConversation
  );
  const [currentUserId, setCurrentUserId] = useState(cachedChat?.currentUserId || null);
  const [messages, setMessages] = useState(cachedChat?.messages || []);
  const [input, setInput] = useState('');
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [loading, setLoading] = useState(!cachedChat);
  const hasLoadedRef = useRef(Boolean(cachedChat));
  const [sending, setSending] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [error, setError] = useState(null);
  const [mutualRevealVisible, setMutualRevealVisible] = useState(false);
  const [focusRevealVisible, setFocusRevealVisible] = useState(false);
  const [sharedChatThemeId, setSharedChatThemeId] = useState(null);
  const conversationRef = useRef(conversation);
  const messagesRef = useRef(messages);
  const currentUserIdRef = useRef(currentUserId);
  const lastFullLoadAtRef = useRef(cachedChat ? Date.now() : 0);
  const loadInFlightRef = useRef(null);
  const realtimeRefreshTimerRef = useRef(null);
  const realtimeRefreshModeRef = useRef('messages');
  const realtimeRefreshPendingRef = useRef(false);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const isCircle = conversation?.is_circle == null
    ? conversation?.kind === 'group'
    : Boolean(conversation.is_circle);
  const chatTheme = sharedChatThemeId
    ? getTheme(sharedChatThemeId)
    : globalTheme;

  const revealRomanticState = useCallback(async (targetConversation) => {
    if (targetConversation?.kind !== 'direct') return;

    const mutualReveal = await openRomanticMutualReveal(conversationId);
    if (mutualReveal.shouldReveal) {
      setMutualRevealVisible(true);
      return;
    }

    const focusReveal = await openRomanticFocusReveal(conversationId);
    if (focusReveal.shouldReveal) {
      setFocusRevealVisible(true);
    }
  }, [conversationId]);

  const markReadIfVisible = useCallback(async () => {
    if (
      screenFocusedRef.current
      && appStateRef.current === 'active'
    ) {
      await markConversationRead(conversationId);
    }
  }, [conversationId]);

  const persistChatSnapshot = useCallback(({
    nextConversation = conversationRef.current,
    nextCurrentUserId = currentUserIdRef.current,
    nextMessages = messagesRef.current,
  } = {}) => {
    writeNavigationCache(navigationCacheKeys.chat(conversationId), {
      conversation: nextConversation,
      currentUserId: nextCurrentUserId,
      messages: nextMessages,
    });
  }, [conversationId]);

  const load = useCallback(async ({
    quiet = false,
    checkRomanticReveal = false,
    messagesOnly = false,
    force = false,
  } = {}) => {
    if (!conversationId) return;

    const hasFreshFullLoad = hasLoadedRef.current
      && Date.now() - lastFullLoadAtRef.current < CHAT_FOCUS_FRESH_MS;

    if (!force && !messagesOnly && hasFreshFullLoad) {
      if (checkRomanticReveal) {
        await revealRomanticState(conversationRef.current);
      }
      await markReadIfVisible();
      return;
    }

    if (loadInFlightRef.current) {
      return loadInFlightRef.current;
    }

    if (!quiet) setLoading(true);
    setError(null);

    const request = (async () => {
      try {
        if (messagesOnly) {
          const rows = await listConversationMessages(conversationId);
          const nextRows = reconcileRowsById(
            messagesRef.current,
            rows,
            sameChatMessage
          );
          setMessages(nextRows);
          messagesRef.current = nextRows;
          persistChatSnapshot({ nextMessages: nextRows });
          await markReadIfVisible();
          return;
        }

        const userPromise = currentUserIdRef.current
          ? Promise.resolve({ id: currentUserIdRef.current })
          : getCurrentConversationUser();

        const [user, rows, details] = await Promise.all([
          userPromise,
          listConversationMessages(conversationId),
          getConversationDetails(conversationId),
        ]);

        const nextConversation = details?.conversation
          || conversationRef.current
          || cachedChat?.conversation
          || routeConversation;

        const nextRows = reconcileRowsById(
          messagesRef.current,
          rows,
          sameChatMessage
        );
        setCurrentUserId(user.id);
        currentUserIdRef.current = user.id;
        setMessages(nextRows);
        messagesRef.current = nextRows;
        setConversation(nextConversation);
        conversationRef.current = nextConversation;
        lastFullLoadAtRef.current = Date.now();

        if (details?.conversation) {
          writeNavigationCache(
            navigationCacheKeys.conversationDetails(conversationId),
            details
          );
        }
        persistChatSnapshot({
          nextConversation,
          nextCurrentUserId: user.id,
          nextMessages: nextRows,
        });

        if (checkRomanticReveal) {
          await revealRomanticState(nextConversation);
        }

        await markReadIfVisible();
      } catch (loadError) {
        if (!quiet || messagesRef.current.length === 0) {
          setError(loadError?.message || 'Could not load this private conversation.');
        }
      } finally {
        setLoading(false);
      }
    })();

    loadInFlightRef.current = request.finally(() => {
      loadInFlightRef.current = null;
    });

    return loadInFlightRef.current;
  }, [
    conversationId,
    markReadIfVisible,
    persistChatSnapshot,
    revealRomanticState,
  ]);

  const scheduleRealtimeRefresh = useCallback((mode = 'messages') => {
    if (mode === 'full') realtimeRefreshModeRef.current = 'full';
    if (realtimeRefreshTimerRef.current) {
      clearTimeout(realtimeRefreshTimerRef.current);
    }

    const runRefresh = () => {
      if (loadInFlightRef.current) {
        realtimeRefreshPendingRef.current = true;
        void loadInFlightRef.current.finally(() => {
          if (!realtimeRefreshPendingRef.current) return;
          realtimeRefreshPendingRef.current = false;
          realtimeRefreshTimerRef.current = setTimeout(runRefresh, 0);
        });
        return;
      }

      const nextMode = realtimeRefreshModeRef.current;
      realtimeRefreshModeRef.current = 'messages';
      realtimeRefreshTimerRef.current = null;
      void load({
        quiet: true,
        messagesOnly: nextMode !== 'full',
        force: true,
      });
    };

    realtimeRefreshTimerRef.current = setTimeout(
      runRefresh,
      CHAT_REALTIME_DEBOUNCE_MS
    );
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      void load({ quiet: hasLoadedRef.current, checkRomanticReveal: true }).finally(() => {
        hasLoadedRef.current = true;
      });

      return () => {
        screenFocusedRef.current = false;
      };
    }, [load])
  );

  useEffect(() => {
    let active = true;

    if (!conversationId || !isCircle) {
      setSharedChatThemeId(null);
      return undefined;
    }

    getCircleThemeSettings(conversationId)
      .then((settings) => {
        if (active) setSharedChatThemeId(settings?.themeId || null);
      })
      .catch(() => {
        if (active) setSharedChatThemeId(null);
      });

    return () => {
      active = false;
    };
  }, [conversationId, isCircle]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;

      if (nextState === 'active' && screenFocusedRef.current) {
        void load({ quiet: true, checkRomanticReveal: true });
      }
    });

    return () => subscription.remove();
  }, [load]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const unsubscribe = subscribeToConversationChanges({
      conversationId,
      onMessage: () => scheduleRealtimeRefresh('messages'),
      onReadChange: (payload) => {
        const messageId = payload?.new?.message_id || payload?.old?.message_id;
        if (
          !messageId
          || messagesRef.current.some((message) => message.id === messageId)
        ) {
          scheduleRealtimeRefresh('messages');
        }
      },
      onConversationChange: () => scheduleRealtimeRefresh('full'),
    });

    return () => {
      unsubscribe();
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      realtimeRefreshPendingRef.current = false;
    };
  }, [conversationId, scheduleRealtimeRefresh]);

  useEffect(() => {
    const timer = setTimeout(() => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    }, 40);
    return () => clearTimeout(timer);
  }, [messages.length]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios'
      ? 'keyboardWillShow'
      : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios'
      ? 'keyboardWillHide'
      : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      setTimeout(() => {
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      }, 80);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const pickMedia = async () => {
    if (sending) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Photo permission needed',
          'Allow photo access to send private media in this conversation.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: MAX_ATTACHMENTS,
        quality: 0.9,
        videoQuality:
          ImagePicker.UIImagePickerControllerQualityType.Medium,
      });

      if (result.canceled) return;

      const nextAssets = (result.assets || []).map(normalizeAsset);
      const merged = [...selectedAssets, ...nextAssets].slice(0, MAX_ATTACHMENTS);
      const validationError = validateAssets(merged);

      if (validationError) {
        Alert.alert('Media not supported', validationError);
        return;
      }

      setSelectedAssets(merged);
    } catch (pickerError) {
      Alert.alert(
        'Could not open your library',
        pickerError?.message || 'Please try again.'
      );
    }
  };

  const send = async () => {
    const body = input.trim();
    if ((!body && selectedAssets.length === 0) || sending) return;

    const validationError = validateAssets(selectedAssets);
    if (validationError) {
      Alert.alert('Media not supported', validationError);
      return;
    }

    setSending(true);
    setUploadStage(selectedAssets.length ? 'Preparing media…' : '');
    const uploadedPaths = [];

    try {
      await Haptics.selectionAsync();
      const uploaded = [];

      for (let index = 0; index < selectedAssets.length; index += 1) {
        const asset = selectedAssets[index];
        setUploadStage(
          `Uploading ${index + 1} of ${selectedAssets.length}…`
        );

        const result = await uploadConversationAsset({
          conversationId,
          category: 'messages',
          uri: asset.uri,
          mimeType: asset.mimeType,
        });

        uploadedPaths.push(result.storagePath);
        uploaded.push({
          storagePath: result.storagePath,
          mediaType: asset.mediaType,
          width: asset.width,
          height: asset.height,
          durationMs: asset.durationMs,
        });
      }

      setUploadStage('Sending…');
      const message = await sendConversationMessage(
        conversationId,
        body,
        uploaded
      );

      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        const nextMessages = [message, ...current];
        messagesRef.current = nextMessages;
        writeNavigationCache(navigationCacheKeys.chat(conversationId), {
          conversation,
          currentUserId,
          messages: nextMessages,
        });
        return nextMessages;
      });
      setInput('');
      setSelectedAssets([]);
      await markConversationRead(conversationId);
    } catch (sendError) {
      if (uploadedPaths.length) {
        removeConversationMedia(uploadedPaths).catch(() => {});
      }

      Alert.alert(
        'Message not sent',
        sendError?.message || 'Please try again.'
      );
    } finally {
      setSending(false);
      setUploadStage('');
    }
  };

  const unsendMessage = useCallback(async (message) => {
    if (message.senderId !== currentUserId || deletingMessageId) return;

    setDeletingMessageId(message.id);
    try {
      await deleteOwnConversationMessage(message.id);
      setMessages((current) => {
        const nextMessages = current.filter((item) => item.id !== message.id);
        messagesRef.current = nextMessages;
        writeNavigationCache(navigationCacheKeys.chat(conversationId), {
          conversation,
          currentUserId,
          messages: nextMessages,
        });
        return nextMessages;
      });
    } catch (deleteError) {
      Alert.alert(
        'Message not unsent',
        deleteError?.message || 'Please try again.'
      );
    } finally {
      setDeletingMessageId(null);
    }
  }, [conversation, conversationId, currentUserId, deletingMessageId]);

  const confirmUnsend = useCallback((message) => {
    if (Number(message.readCount || 0) > 0) {
      Alert.alert(
        'Already read',
        'Messages can only be unsent before anyone else reads them.'
      );
      return;
    }

    const detail = message.media.length
      ? (isCircle
        ? 'This removes it for everyone and from the Circle Timeline.'
        : 'This removes it for both people and from Shared Media.')
      : 'This removes it for everyone in this conversation.';

    Alert.alert(
      'Unsend this message?',
      detail,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unsend',
          style: 'destructive',
          onPress: () => unsendMessage(message),
        },
      ]
    );
  }, [isCircle, unsendMessage]);

  const showMessageActions = useCallback((message) => {
    if (message.senderId !== currentUserId || deletingMessageId) return;

    if (Number(message.readCount || 0) > 0) {
      Alert.alert(
        'Already read',
        'This message can no longer be unsent because someone has read it.'
      );
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Unsend Message'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
          title: 'Message options',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) confirmUnsend(message);
        }
      );
      return;
    }

    Alert.alert(
      'Message options',
      null,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unsend Message',
          style: 'destructive',
          onPress: () => confirmUnsend(message),
        },
      ]
    );
  }, [confirmUnsend, currentUserId, deletingMessageId]);

  const openMedia = useCallback((message, startIndex) => {
    const items = message.media.map((item) => ({
      ...item,
      senderName: message.senderName,
      senderAvatar: message.senderAvatar,
      messageBody: message.body,
      createdAt: message.createdAt,
    }));

    navigation.navigate('ConversationMedia', {
      items,
      startIndex,
    });
  }, [navigation]);


  const otherUserId = conversation?.other_user_id || initialOtherUserId || null;

  const openIdentity = () => {
    if (isCircle) {
      navigation.navigate('CircleProfile', { conversationId });
      return;
    }

    if (otherUserId) {
      navigation.navigate('Profile', { userId: otherUserId });
    }
  };

  const openDirectDetails = () => {
    navigation.navigate('DirectConversationDetails', {
      conversationId,
      name: conversation?.title || name,
      avatarUri: conversation?.avatar_url || initialAvatarUri,
    });
  };

  const renderMessage = useCallback(({ item }) => (
    <ChatMessageRow
      item={item}
      currentUserId={currentUserId}
      isGroup={conversation?.kind === 'group'}
      isDeleting={deletingMessageId === item.id}
      onShowActions={showMessageActions}
      onOpenMedia={openMedia}
    />
  ), [
    conversation?.kind,
    currentUserId,
    deletingMessageId,
    openMedia,
    showMessageActions,
  ]);

  if (!conversationId) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>This conversation is unavailable.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ThemeAtmosphere theme={chatTheme} strength={0.82} />
      <MutualInterestRevealModal
        visible={mutualRevealVisible}
        onContinue={() => setMutualRevealVisible(false)}
      />
      <MutualFocusRevealModal
        visible={focusRevealVisible}
        onContinue={() => setFocusRevealVisible(false)}
      />

      <View style={[
        styles.chatHeader,
        {
          paddingTop: insets.top,
          borderBottomColor: chatTheme.colors.border,
        },
      ]}>
        <View style={styles.chatHeaderRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back to Circles"
            hitSlop={10}
            style={({ pressed }) => [
              styles.headerSide,
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="chevron-back" size={29} color={COLORS.text} />
          </Pressable>

          <View style={styles.chatHeaderIdentity}>
            <ConversationHeaderTitle
              name={conversation?.title || name}
              avatarUri={conversation?.avatar_url || initialAvatarUri}
              onPress={openIdentity}
            />
          </View>

          {isCircle ? (
            <View style={styles.headerSide} />
          ) : (
            <Pressable
              onPress={openDirectDetails}
              accessibilityRole="button"
              accessibilityLabel="Open shared media and conversation details"
              hitSlop={10}
              style={({ pressed }) => [
                styles.headerSide,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={24}
                color={COLORS.text}
              />
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.chatBody}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.continuityState}>
            <ContinuityLoadingCard
              label="Loading messages…"
              body="The conversation is already open while the private message history catches up."
              icon="chatbubble-ellipses-outline"
            />
          </View>
        ) : error ? (
          <View style={styles.continuityState}>
            <ContinuityLoadingCard
              error={error}
              icon="lock-closed-outline"
              onRetry={() => load()}
            />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyState}>
            <ConversationHeaderTitle
              name={conversation?.title || name}
              avatarUri={conversation?.avatar_url || initialAvatarUri}
              onPress={openIdentity}
            />
            <Text style={styles.emptyTitle}>
              {isCircle ? 'A private Circle' : 'Start a private conversation'}
            </Text>
            <Text style={styles.emptyBody}>
              {isCircle
                ? 'Messages and shared media are visible only to accepted members. Photos and videos you send automatically appear in this Circle’s Timeline.'
                : 'Messages are private between you and this connection. Photos and videos remain available under Shared Media without creating a separate Circle profile.'}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            initialNumToRender={18}
            maxToRenderPerBatch={14}
            updateCellsBatchingPeriod={35}
            windowSize={9}
            removeClippedSubviews
            inverted
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === 'ios' ? 'interactive' : 'on-drag'
            }
            contentContainerStyle={styles.messageList}
          />
        )}

        {!loading && !error ? (
          <View>
            <SelectedMedia
              assets={selectedAssets}
              disabled={sending}
              onRemove={(assetId) => setSelectedAssets((current) =>
                current.filter((asset) => asset.id !== assetId)
              )}
            />

            {uploadStage ? (
              <View style={styles.uploadStage}>
                <ActivityIndicator size="small" />
                <Text style={styles.uploadStageText}>{uploadStage}</Text>
              </View>
            ) : null}

            <View style={[
              styles.composer,
              {
                paddingBottom: keyboardVisible
                  ? 8
                  : Math.max(8, insets.bottom),
              },
            ]}>
              <Pressable
                onPress={pickMedia}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Choose photos or videos"
                style={({ pressed }) => [
                  styles.addButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="add" size={25} color={COLORS.text} />
              </Pressable>

              <View style={styles.inputWrap}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Message"
                  placeholderTextColor="#9e9e9e"
                  multiline
                  maxLength={4000}
                  editable={!sending}
                  style={styles.input}
                  onFocus={() => setTimeout(() => {
                    listRef.current?.scrollToOffset?.({
                      offset: 0,
                      animated: true,
                    });
                  }, 60)}
                />
              </View>

              <Pressable
                onPress={send}
                disabled={
                  sending
                  || (!input.trim() && selectedAssets.length === 0)
                }
                accessibilityRole="button"
                accessibilityLabel="Send message"
                style={({ pressed }) => [
                  styles.sendButton,
                  input.trim() || selectedAssets.length
                    ? styles.sendButtonReady
                    : styles.sendButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="arrow-up" size={18} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  mutualModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  mutualModalCard: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
    borderRadius: 24,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 26,
    paddingTop: 30,
    paddingBottom: 24,
  },
  focusModalCard: {
    backgroundColor: '#fbfaff',
  },
  mutualMark: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  mutualMarkOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1.5,
    borderColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutualMarkInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#ffe8ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusMarkInner: {
    backgroundColor: '#ece7ff',
  },
  mutualModalTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
    textAlign: 'center',
  },
  mutualModalBody: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  mutualContinueButton: {
    width: '100%',
    minHeight: 48,
    marginTop: 22,
    borderRadius: 14,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutualContinueText: {
    color: COLORS.bg,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  chatHeader: {
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  chatHeaderRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  chatHeaderIdentity: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSide: {
    width: 54,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    alignItems: 'flex-start',
    paddingLeft: 4,
  },
  chatBody: {
    flex: 1,
    minHeight: 0,
  },
  continuityState: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  retryText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
  },
  emptyProfile: {
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 8,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  emptyBody: {
    maxWidth: 420,
    marginTop: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  messageList: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingTop: 10,
    paddingBottom: 8,
  },
  messageWrap: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  senderName: {
    marginLeft: 11,
    marginBottom: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  messageContent: {
    maxWidth: '78%',
  },
  mineContent: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  otherContent: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: 300,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  mineBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 6,
  },
  otherBubble: {
    backgroundColor: '#e9e9eb',
    borderBottomLeftRadius: 6,
  },
  textWithMedia: {
    marginTop: 4,
  },
  messageText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    lineHeight: 21,
  },
  mineText: {
    color: '#fff',
  },
  otherText: {
    color: '#000',
  },
  messageTime: {
    marginTop: 3,
    color: '#8e8e93',
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
  },
  mineTime: {
    alignSelf: 'flex-end',
  },
  otherTime: {
    alignSelf: 'flex-start',
  },
  messageMediaGrid: {
    width: 242,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  singleMediaGrid: {
    width: 242,
  },
  messageMediaTile: {
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#1c1c1e',
  },
  messageMediaImage: {
    width: '100%',
    height: '100%',
  },
  messageVideoTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1c1e',
  },
  deletingIndicator: {
    marginTop: 5,
  },
  selectedMediaRow: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  selectedTile: {
    width: 66,
    height: 66,
    overflow: 'visible',
    marginRight: 7,
    borderRadius: 10,
    backgroundColor: '#1c1c1e',
  },
  selectedImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  selectedVideo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#1c1c1e',
  },
  removeAttachment: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.bg,
    backgroundColor: '#4a4a4a',
  },
  uploadStage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
  },
  uploadStageText: {
    marginLeft: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingHorizontal: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.90)',
  },
  addButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
    borderRadius: 19,
    backgroundColor: '#ededed',
  },
  inputWrap: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c7c7cc',
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.90)',
  },
  input: {
    minHeight: 38,
    maxHeight: 116,
    paddingHorizontal: 13,
    paddingTop: Platform.OS === 'ios' ? 9 : 6,
    paddingBottom: Platform.OS === 'ios' ? 8 : 6,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
  },
  sendButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 7,
    borderRadius: 19,
  },
  sendButtonReady: {
    backgroundColor: COLORS.primary,
  },
  sendButtonDisabled: {
    backgroundColor: '#d1d1d6',
  },
  pressed: {
    opacity: 0.72,
  },
});
