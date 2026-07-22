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
  removeConversationMedia,
  uploadConversationAsset,
} from '../../services/conversationMediaService';

const MAX_ATTACHMENTS = 6;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_DURATION_MS = 30 * 1000;

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
  const listRef = useRef(null);
  const screenFocusedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState || 'active');
  const [conversation, setConversation] = useState({
    title: name,
    kind,
    avatar_url: initialAvatarUri,
    other_user_id: initialOtherUserId,
    is_circle: initialIsCircle,
  });
  const [currentUserId, setCurrentUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError(null);

    try {
      const [user, rows, details] = await Promise.all([
        getCurrentConversationUser(),
        listConversationMessages(conversationId),
        getConversationDetails(conversationId),
      ]);
      setCurrentUserId(user.id);
      setMessages(rows);
      if (details?.conversation) setConversation(details.conversation);

      if (
        screenFocusedRef.current
        && appStateRef.current === 'active'
      ) {
        await markConversationRead(conversationId);
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not load this private conversation.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      load();

      return () => {
        screenFocusedRef.current = false;
      };
    }, [load])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;

      if (nextState === 'active' && screenFocusedRef.current) {
        load({ quiet: true });
      }
    });

    return () => subscription.remove();
  }, [load]);

  useEffect(() => {
    if (!conversationId) return undefined;
    return subscribeToConversationChanges({
      conversationId,
      onMessage: () => load({ quiet: true }),
      onMediaChange: () => load({ quiet: true }),
      onConversationChange: () => load({ quiet: true }),
    });
  }, [conversationId, load]);

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
        return [message, ...current];
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

  const unsendMessage = async (message) => {
    if (message.senderId !== currentUserId || deletingMessageId) return;

    setDeletingMessageId(message.id);
    try {
      await deleteOwnConversationMessage(message.id);
      setMessages((current) =>
        current.filter((item) => item.id !== message.id)
      );
    } catch (deleteError) {
      Alert.alert(
        'Message not unsent',
        deleteError?.message || 'Please try again.'
      );
    } finally {
      setDeletingMessageId(null);
    }
  };

  const confirmUnsend = (message) => {
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
  };

  const showMessageActions = (message) => {
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
  };

  const openMedia = (message, startIndex) => {
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
  };

  const isCircle = conversation?.is_circle == null
    ? conversation?.kind === 'group'
    : Boolean(conversation.is_circle);
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
    navigation.navigate('DirectConversationDetails', { conversationId });
  };

  const renderMessage = ({ item }) => {
    const mine = item.senderId === currentUserId;
    const hasText = Boolean(item.body);
    const hasMedia = item.media?.length > 0;
    const readStatus = mine
      ? formatReadStatus(item, conversation?.kind === 'group')
      : '';
    const canUnsend = mine && Number(item.readCount || 0) === 0;

    return (
      <Pressable
        onLongPress={() => showMessageActions(item)}
        delayLongPress={360}
        disabled={!mine || deletingMessageId === item.id}
        accessibilityRole="button"
        accessibilityLabel={mine ? 'Your message' : `${item.senderName}'s message`}
        accessibilityHint={mine
          ? (canUnsend
            ? 'Press and hold to unsend before anyone reads it.'
            : 'This message has already been read and cannot be unsent.')
          : undefined}
        style={styles.messageWrap}
      >
        {!mine && conversation?.kind === 'group' ? (
          <Text style={styles.senderName}>{item.senderName}</Text>
        ) : null}

        <View style={[
          styles.messageContent,
          mine ? styles.mineContent : styles.otherContent,
        ]}>
          {hasMedia ? (
            <MessageMediaGrid
              items={item.media}
              onOpen={(index) => openMedia(item, index)}
              onLongPress={mine ? () => showMessageActions(item) : undefined}
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

          {deletingMessageId === item.id ? (
            <ActivityIndicator
              size="small"
              style={styles.deletingIndicator}
            />
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
  };

  if (!conversationId) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>This conversation is unavailable.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.chatHeader, { paddingTop: insets.top }]}>
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
          <View style={styles.centerState}>
            <ActivityIndicator />
            <Text style={styles.stateText}>Opening private conversation…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Ionicons name="lock-closed-outline" size={34} color={COLORS.text} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => load()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
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
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  chatHeader: {
    flexShrink: 0,
    backgroundColor: COLORS.bg,
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
    backgroundColor: COLORS.bg,
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
    backgroundColor: COLORS.bg,
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
