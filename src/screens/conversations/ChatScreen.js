import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../../theme/colors';
import {
  getCurrentConversationUser,
  listConversationMessages,
  markConversationRead,
  sendConversationMessage,
  subscribeToConversationChanges,
} from '../../services/conversationService';

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ChatScreen({ route, navigation }) {
  const { conversationId, name = 'Conversation', kind = 'direct' } = route.params || {};
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoading(true);
    setError(null);

    try {
      const [user, rows] = await Promise.all([
        getCurrentConversationUser(),
        listConversationMessages(conversationId),
      ]);
      setCurrentUserId(user.id);
      setMessages(rows);
      await markConversationRead(conversationId);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load this private conversation.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    navigation.setOptions({
      title: name,
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ConversationDetails', {
            conversationId,
            name,
          })}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Open shared private space"
        >
          <Ionicons
            name="ellipsis-horizontal-circle"
            size={24}
            color={COLORS.text}
          />
        </Pressable>
      ),
    });
  }, [conversationId, name, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!conversationId) return undefined;
    return subscribeToConversationChanges({
      conversationId,
      onMessage: () => load({ quiet: true }),
      onConversationChange: () => load({ quiet: true }),
    });
  }, [conversationId, load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    }, 40);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const send = async () => {
    const body = input.trim();
    if (!body || sending) return;

    setInput('');
    setSending(true);

    try {
      await Haptics.selectionAsync();
      const message = await sendConversationMessage(conversationId, body);
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        return [message, ...current];
      });
      await markConversationRead(conversationId);
    } catch (sendError) {
      setInput(body);
      Alert.alert(
        'Message not sent',
        sendError?.message || 'Please try again.'
      );
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const mine = item.senderId === currentUserId;

    return (
      <View style={styles.messageWrap}>
        {!mine && kind === 'group' ? (
          <Text style={styles.senderName}>{item.senderName}</Text>
        ) : null}
        <View style={[
          styles.bubble,
          mine ? styles.mineBubble : styles.otherBubble,
        ]}>
          <Text style={[
            styles.messageText,
            mine ? styles.mineText : styles.otherText,
          ]}>
            {item.body}
          </Text>
        </View>
        <Text style={[
          styles.messageTime,
          mine ? styles.mineTime : styles.otherTime,
        ]}>
          {formatTime(item.createdAt)}
        </Text>
      </View>
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
    <SafeAreaView edges={['bottom']} style={styles.screen}>
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
          <View style={styles.emptyIcon}>
            <Ionicons name="lock-closed" size={25} color={COLORS.text} />
          </View>
          <Text style={styles.emptyTitle}>A private space for you</Text>
          <Text style={styles.emptyBody}>
            Messages are visible only to accepted members. Send the first
            message to begin this shared history.
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
          contentContainerStyle={styles.messageList}
        />
      )}

      {!loading && !error ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 86 : 0}
        >
          <View style={[
            styles.composer,
            { paddingBottom: Math.max(8, insets.bottom) },
          ]}>
            <View style={styles.inputWrap}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Message"
                placeholderTextColor="#9e9e9e"
                multiline
                maxLength={4000}
                style={styles.input}
                onFocus={() => setTimeout(() => {
                  listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
                }, 60)}
              />
            </View>

            <Pressable
              onPress={send}
              disabled={sending || !input.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              style={({ pressed }) => [
                styles.sendButton,
                input.trim() ? styles.sendButtonReady : styles.sendButtonDisabled,
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
        </KeyboardAvoidingView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
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
  messageList: {
    flexGrow: 1,
    paddingTop: 10,
    paddingBottom: 8,
  },
  messageWrap: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  senderName: {
    marginLeft: 7,
    marginBottom: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  mineBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 6,
    backgroundColor: COLORS.primary,
  },
  otherBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 6,
    backgroundColor: '#e9e9eb',
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
    color: COLORS.text,
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: '#f1f1f1',
  },
  emptyTitle: {
    marginTop: 14,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  emptyBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 9,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  inputWrap: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: Platform.OS === 'ios' ? 8 : 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  input: {
    maxHeight: 96,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    padding: 0,
  },
  sendButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderRadius: 19,
  },
  sendButtonReady: {
    backgroundColor: COLORS.primary,
  },
  sendButtonDisabled: {
    backgroundColor: '#d1d1d6',
  },
  pressed: {
    opacity: 0.75,
  },
});
