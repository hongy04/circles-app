import React, { useCallback, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import {
  invitePeopleToCircle,
  listCircleInviteCandidates,
} from '../../services/circlePeopleService';

export function InviteCirclePeopleScreen({ route, navigation }) {
  const { conversationId, circleName = 'Circle' } = route.params || {};
  const [people, setPeople] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError('');

    try {
      setPeople(await listCircleInviteCandidates(conversationId));
      setSelectedIds(new Set());
    } catch (loadError) {
      setError(loadError?.message || 'Could not load people you can invite.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filteredPeople = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return people;
    return people.filter((person) =>
      person.displayName.toLowerCase().includes(normalized)
    );
  }, [people, query]);

  const selectedPeople = useMemo(
    () => people.filter((person) => selectedIds.has(person.userId)),
    [people, selectedIds]
  );

  const toggle = (userId) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const send = async () => {
    if (!selectedIds.size || sending) return;
    setSending(true);

    try {
      const count = await invitePeopleToCircle(
        conversationId,
        Array.from(selectedIds)
      );
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
      navigation.goBack();
      setTimeout(() => {
        Alert.alert(
          count === 1 ? 'Invitation sent' : 'Invitations sent',
          `${count} private invitation${count === 1 ? '' : 's'} sent to ${circleName}.`
        );
      }, 250);
    } catch (sendError) {
      Alert.alert(
        'Could not send invitations',
        sendError?.message || 'Please try again.'
      );
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Finding connections…</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="person-add-outline" size={38} color={COLORS.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <View style={styles.topArea}>
          <View style={styles.privacyCard}>
            <Ionicons name="lock-closed-outline" size={21} color={COLORS.text} />
            <Text style={styles.privacyText}>
              Only your accepted connections appear here. Everyone must accept
              before they can view the Circle or its history.
            </Text>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={COLORS.subtext} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search connections"
              placeholderTextColor="#8e8e93"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#a3a3a3" />
              </Pressable>
            ) : null}
          </View>

          {selectedPeople.length ? (
            <FlatList
              horizontal
              data={selectedPeople}
              keyExtractor={(person) => person.userId}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectedList}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => toggle(item.userId)}
                  style={({ pressed }) => [
                    styles.selectedPerson,
                    pressed && styles.pressed,
                  ]}
                >
                  <View>
                    <Avatar
                      size={48}
                      name={item.displayName}
                      uri={item.avatarUri}
                    />
                    <View style={styles.removeBadge}>
                      <Ionicons name="close" size={11} color="#fff" />
                    </View>
                  </View>
                  <Text style={styles.selectedName} numberOfLines={1}>
                    {item.displayName}
                  </Text>
                </Pressable>
              )}
            />
          ) : null}
        </View>

        <FlatList
          data={filteredPeople}
          keyExtractor={(person) => person.userId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={38} color={COLORS.subtext} />
              <Text style={styles.emptyTitle}>
                {query ? 'No matching connections' : 'No one else to invite'}
              </Text>
              <Text style={styles.emptyBody}>
                {query
                  ? 'Try another name.'
                  : 'Everyone eligible is already a member or has a pending invitation.'}
              </Text>
            </View>
          )}
          renderItem={({ item, index }) => {
            const selected = selectedIds.has(item.userId);
            return (
              <View style={[
                styles.rowWrap,
                index === 0 && styles.firstRow,
                index === filteredPeople.length - 1 && styles.lastRow,
              ]}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <Pressable
                  onPress={() => toggle(item.userId)}
                  style={({ pressed }) => [
                    styles.personRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <Avatar
                    size={49}
                    name={item.displayName}
                    uri={item.avatarUri}
                  />
                  <View style={styles.personCopy}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                    <Text style={styles.personSubtitle}>Accepted connection</Text>
                  </View>
                  <View style={[
                    styles.checkbox,
                    selected && styles.checkboxSelected,
                  ]}>
                    {selected ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.bottomBar}>
          <Pressable
            onPress={send}
            disabled={!selectedIds.size || sending}
            style={({ pressed }) => [
              styles.sendButton,
              !selectedIds.size && styles.sendButtonDisabled,
              (pressed || sending) && styles.pressed,
            ]}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendText}>
                Send {selectedIds.size || ''} invitation{selectedIds.size === 1 ? '' : 's'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  keyboardView: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
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
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  retryText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  topArea: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#eeeeee',
  },
  privacyText: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 17,
  },
  searchBox: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
  },
  selectedList: {
    paddingTop: 13,
    paddingBottom: 3,
  },
  selectedPerson: {
    width: 66,
    alignItems: 'center',
    marginRight: 5,
  },
  selectedName: {
    width: 64,
    marginTop: 4,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 9,
    textAlign: 'center',
  },
  removeBadge: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#f7f7f7',
    backgroundColor: '#707070',
  },
  listContent: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 24,
    flexGrow: 1,
  },
  rowWrap: {
    overflow: 'hidden',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  firstRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  lastRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  personRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  personCopy: {
    flex: 1,
    marginLeft: 12,
  },
  personName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  personSubtitle: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  checkbox: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#bdbdbd',
    backgroundColor: COLORS.bg,
  },
  checkboxSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 74,
    backgroundColor: COLORS.border,
  },
  emptyState: {
    flex: 1,
    minHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyTitle: {
    marginTop: 10,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  emptyBody: {
    marginTop: 5,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  bottomBar: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  sendButton: {
    minHeight: 47,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  sendButtonDisabled: {
    backgroundColor: '#c9c9c9',
  },
  sendText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.68,
  },
});
