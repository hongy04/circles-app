import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
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

import { ThemeAtmosphere } from '../../components/ThemeAtmosphere';
import * as Haptics from 'expo-haptics';
import { Avatar } from '../../components/Avatar';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(77,185,229,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
import {
  invitePeopleToCircle,
  listCircleInviteCandidates,
} from '../../services/circlePeopleService';
import { createCircleInvite, shareInvite } from '../../services/inviteService';

function InviteCirclePeopleContent({ route, navigation }) {
  const { conversationId, circleName = 'Circle' } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [people, setPeople] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sharingLink, setSharingLink] = useState(false);

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

  const shareCircleLink = async () => {
    if (!conversationId || sharingLink) return;
    setSharingLink(true);

    try {
      const invite = await createCircleInvite(conversationId);
      await shareInvite(invite);
    } catch (shareError) {
      Alert.alert(
        'Could not share Circle invite',
        shareError?.message || 'Please try again.'
      );
    } finally {
      setSharingLink(false);
    }
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
        <Ionicons name="person-add-outline" size={38} color={theme.colors.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ThemeAtmosphere theme={theme} strength={0.66} decals />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <View style={styles.topArea}>
          <View style={styles.privacyCard}>
            <Ionicons name="lock-closed-outline" size={21} color={theme.colors.text} />
            <Text style={styles.privacyText}>
              Only your accepted connections appear here. Everyone must accept
              before they can view the Circle or its history.
            </Text>
          </View>

          <View style={styles.linkInviteCard}>
            <View style={styles.linkInviteCopy}>
              <Text style={styles.linkInviteTitle}>Invite beyond your connections</Text>
              <Text style={styles.linkInviteBody}>
                Share a private Circle link in an existing group chat. Each person
                still reviews the invitation before joining.
              </Text>
            </View>
            <Pressable
              onPress={shareCircleLink}
              disabled={sharingLink}
              style={({ pressed }) => [
                styles.linkInviteButton,
                (pressed || sharingLink) && styles.pressed,
              ]}
            >
              {sharingLink ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="share-outline" size={19} color="#fff" />
              )}
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={theme.colors.subtext} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search connections"
              placeholderTextColor={theme.colors.subtext}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.colors.subtext} />
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
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={38} color={theme.colors.subtext} />
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

export function InviteCirclePeopleScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <InviteCirclePeopleContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  const glass = rgba(theme.colors.surface, 0.84);
  const glassStrong = rgba(theme.colors.surface, 0.93);
  const accentLine = rgba(theme.circle.accent, 0.20);
  const accentWash = rgba(theme.circle.accent, 0.10);
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  keyboardView: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: theme.colors.surface,
  },
  stateText: {
    marginTop: 10,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
    marginTop: 12,
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.welcome.brandInk,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    shadowColor: '#000',
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  privacyText: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 17,
  },
  linkInviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    padding: 13,
    marginTop: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  linkInviteCopy: {
    flex: 1,
    paddingRight: 12,
  },
  linkInviteTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
  },
  linkInviteBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  linkInviteButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.welcome.brandInk,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderColor: accentLine,
    backgroundColor: glassStrong,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
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
    color: theme.colors.text,
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
    borderColor: glassStrong,
    backgroundColor: theme.welcome.brandInk,
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
    borderColor: accentLine,
    backgroundColor: glass,
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
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  personSubtitle: {
    marginTop: 3,
    color: theme.colors.subtext,
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
    borderColor: accentLine,
    backgroundColor: glassStrong,
  },
  checkboxSelected: {
    borderColor: theme.circle.accent,
    backgroundColor: theme.circle.accent,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 74,
    backgroundColor: theme.colors.divider,
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
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  emptyBody: {
    marginTop: 5,
    color: theme.colors.subtext,
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
    borderTopColor: accentLine,
    backgroundColor: glassStrong,
  },
  sendButton: {
    minHeight: 47,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: theme.welcome.brandInk,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.divider,
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
}
