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
import * as Contacts from 'expo-contacts';

import { Avatar } from '../../components/Avatar';
import { ThemeAtmosphere } from '../../components/ThemeAtmosphere';
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
import { getRegionCode, normalizeToE164 } from '../../utils/contactPhones';
import {
  createPersonalInvite,
  shareInvite,
  textInviteToContact,
} from '../../services/inviteService';

function mapContacts(data, region) {
  const seenNumbers = new Set();
  const mapped = [];

  (data || []).forEach((contact) => {
    const normalizedNumbers = (contact.phoneNumbers || [])
      .map((phone) => normalizeToE164(phone.number, region))
      .filter(Boolean);

    const phoneNumber = normalizedNumbers.find((number) => {
      if (seenNumbers.has(number)) return false;
      seenNumbers.add(number);
      return true;
    });

    if (!phoneNumber) return;

    mapped.push({
      id: contact.id || `${contact.name}-${phoneNumber}`,
      name: contact.name || 'Unknown',
      phoneNumber,
    });
  });

  return mapped.sort((a, b) => a.name.localeCompare(b.name));
}

export function InvitePeopleScreen({ navigation }) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [invite, setInvite] = useState(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [query, setQuery] = useState('');
  const [sendingId, setSendingId] = useState(null);
  const [invitedIds, setInvitedIds] = useState(new Set());

  const loadInvite = useCallback(async () => {
    setLoadingInvite(true);
    setInviteError('');
    try {
      const createdInvite = await createPersonalInvite();
      setInvite(createdInvite);
      return createdInvite;
    } catch (error) {
      setInviteError(error?.message || 'Could not create your invitation.');
      return null;
    } finally {
      setLoadingInvite(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInvite();
    }, [loadInvite])
  );

  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return contacts;
    return contacts.filter((contact) =>
      contact.name.toLowerCase().includes(normalized)
      || contact.phoneNumber.includes(normalized)
    );
  }, [contacts, query]);

  const openContacts = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Contacts are mobile-only',
        'Use the share button to send your invitation from the browser.'
      );
      return;
    }

    setLoadingContacts(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Contacts unavailable',
          'Contacts permission was not granted. You can still share your invitation link.'
        );
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 2000,
      });

      setContacts(mapContacts(data, getRegionCode()));
      setContactsLoaded(true);
    } catch (error) {
      Alert.alert(
        'Could not load contacts',
        error?.message || 'Please try again.'
      );
    } finally {
      setLoadingContacts(false);
    }
  };

  const shareGeneralInvite = async () => {
    if (sharing || loadingInvite) return;
    setSharing(true);
    try {
      const readyInvite = invite || await loadInvite();
      if (!readyInvite) {
        Alert.alert(
          'Invite link unavailable',
          'Circles could not create the invitation yet. Run the database hotfix, then try again.'
        );
        return;
      }
      await shareInvite(readyInvite);
    } catch (error) {
      Alert.alert('Could not share invite', error?.message || 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const inviteContact = async (contact) => {
    if (sendingId) return;
    Keyboard.dismiss();
    setSendingId(contact.id);

    try {
      const readyInvite = invite || await loadInvite();
      if (!readyInvite) {
        throw new Error(
          'Circles could not create the invitation yet. Run the database hotfix, then try again.'
        );
      }
      const response = await textInviteToContact(contact.phoneNumber, readyInvite);
      if (response?.result === 'sent' || response?.result === 'unknown') {
        setInvitedIds((current) => new Set([...current, contact.id]));
      }
    } catch (error) {
      Alert.alert(
        'Could not prepare message',
        error?.message || 'Please try again.'
      );
    } finally {
      setSendingId(null);
    }
  };

  const header = (
    <View>
      <View style={styles.heroCard}>
        <Text style={styles.heroBody}>
          Your link creates social context, not automatic access. Each person
          still chooses whether to connect with you.
        </Text>

        <Pressable
          onPress={shareGeneralInvite}
          disabled={loadingInvite || sharing}
          style={({ pressed }) => [
            styles.primaryButton,
            loadingInvite && styles.disabled,
            (pressed || sharing) && styles.pressed,
          ]}
        >
          {loadingInvite || sharing ? (
            <ActivityIndicator color={theme.colors.onPrimary} />
          ) : (
            <>
              <Ionicons name="share-outline" size={19} color={theme.colors.onPrimary} />
              <Text style={styles.primaryButtonText}>Share invite link</Text>
            </>
          )}
        </Pressable>

        {inviteError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{inviteError}</Text>
            <Pressable onPress={loadInvite} hitSlop={8}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {invite?.url ? (
          <Text style={styles.linkPreview} selectable numberOfLines={2}>
            {invite.url}
          </Text>
        ) : null}
      </View>

      <View style={styles.sectionHeadingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Invite from contacts</Text>
          <Text style={styles.sectionBody}>
            Circles opens one private message at a time—never a group text.
          </Text>
        </View>

        {!contactsLoaded ? (
          <Pressable
            onPress={openContacts}
            disabled={loadingContacts}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            {loadingContacts ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.secondaryButtonText}>Choose</Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {contactsLoaded ? (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={theme.colors.subtext} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search contacts"
            placeholderTextColor={theme.colors.legal}
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
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ThemeAtmosphere theme={theme} strength={0.68} decals />
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.topBarSide}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Invite People</Text>
        <View style={styles.topBarSide} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={contactsLoaded ? filteredContacts : []}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={contactsLoaded ? (
          <View style={styles.emptyState}>
            <Ionicons name="person-add-outline" size={34} color={theme.colors.subtext} />
            <Text style={styles.emptyTitle}>
              {query ? 'No matching contacts' : 'No phone contacts found'}
            </Text>
          </View>
        ) : null}
          renderItem={({ item }) => {
          const sent = invitedIds.has(item.id);
          const busy = sendingId === item.id;
          return (
            <View style={styles.contactRow}>
              <Avatar size={46} name={item.name} />
              <View style={styles.contactCopy}>
                <Text style={styles.contactName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.contactPhone} numberOfLines={1}>
                  {item.phoneNumber}
                </Text>
              </View>
              <Pressable
                onPress={() => inviteContact(item)}
                disabled={Boolean(sendingId)}
                style={({ pressed }) => [
                  styles.inviteButton,
                  sent && styles.invitedButton,
                  (pressed || busy) && styles.pressed,
                  Boolean(sendingId) && !busy && styles.disabled,
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={sent ? theme.colors.text : theme.colors.onPrimary} />
                ) : (
                  <Text style={sent ? styles.invitedText : styles.inviteText}>
                    {sent ? 'Invited' : 'Invite'}
                  </Text>
                )}
              </Pressable>
            </View>
          );
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(theme) {
  const glass = rgba(theme.colors.surface, 0.84);
  const glassStrong = rgba(theme.colors.surface, 0.93);
  const accentLine = rgba(theme.circle.accent, 0.20);
  const accentWash = rgba(theme.circle.accent, 0.10);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  keyboardView: { flex: 1 },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: accentLine,
    backgroundColor: glassStrong,
  },
  topBarSide: {
    width: 52,
    height: 42,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 44,
  },
  heroCard: {
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    padding: 15,
    shadowColor: '#000',
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  heroBody: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 48,
    marginTop: 14,
    borderRadius: 13,
    backgroundColor: theme.circle.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: theme.colors.onPrimary, fontFamily: 'Manrope_700Bold' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  errorBox: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.danger,
    padding: 11,
  },
  errorText: {
    color: theme.colors.danger,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  retryText: {
    marginTop: 6,
    color: theme.colors.danger,
    fontFamily: 'Manrope_700Bold',
  },
  linkPreview: {
    marginTop: 12,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 2,
    gap: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  sectionBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  secondaryButton: {
    minWidth: 82,
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: accentLine,
    backgroundColor: glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glassStrong,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 8,
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
  },
  contactRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
    backgroundColor: glass,
    paddingHorizontal: 12,
    marginBottom: 9,
  },
  contactCopy: { flex: 1, marginHorizontal: 11 },
  contactName: { color: theme.colors.text, fontFamily: 'Manrope_700Bold' },
  contactPhone: {
    marginTop: 2,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  inviteButton: {
    minWidth: 78,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: theme.circle.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  invitedButton: {
    backgroundColor: accentWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentLine,
  },
  inviteText: { color: theme.colors.onPrimary, fontFamily: 'Manrope_700Bold', fontSize: 12 },
  invitedText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 42 },
  emptyTitle: { marginTop: 10, color: theme.colors.text, fontFamily: 'Manrope_700Bold' },
  });
}
