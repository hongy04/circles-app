import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import {
  fetchBlockedAccounts,
  unblockUser,
} from '../../services/safetyService';

function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

export function BlockedAccountsScreen({ navigation }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUserId, setBusyUserId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const rows = await fetchBlockedAccounts();
      setAccounts(rows);
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Could not load blocked accounts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const performUnblock = async (account) => {
    setBusyUserId(account.userId);
    try {
      await unblockUser(account.userId);
      setAccounts((current) => current.filter(
        (item) => item.userId !== account.userId
      ));
    } catch (unblockError) {
      Alert.alert(
        'Account not unblocked',
        unblockError?.message || 'Please try again.'
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const confirmUnblock = (account) => {
    const message = `Unblocking ${account.displayName} does not restore a connection, direct messages, romantic state, or a closed Our Circle.`;

    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Unblock ${account.displayName}?\n\n${message}`)) {
        performUnblock(account);
      }
      return;
    }

    Alert.alert(`Unblock ${account.displayName}?`, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: () => performUnblock(account) },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.topBarSide}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Blocked accounts</Text>
        <View style={styles.topBarSide} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.stateText}>Loading blocked accounts…</Text>
        </View>
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.userId}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ refresh: true })}
              tintColor={COLORS.text}
            />
          )}
          contentContainerStyle={[
            styles.content,
            accounts.length === 0 && styles.emptyContent,
          ]}
          ListHeaderComponent={accounts.length > 0 ? (
            <Text style={styles.intro}>
              Blocked accounts cannot open your profile, connect with you, or message you directly. Shared group and event history may still retain factual names or content.
            </Text>
          ) : null}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Ionicons name="ban-outline" size={42} color={COLORS.subtext} />
              <Text style={styles.emptyTitle}>No blocked accounts</Text>
              <Text style={styles.emptyText}>
                People you block will appear here so you can review or unblock them later.
              </Text>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>
                    {initials(item.displayName)}
                  </Text>
                </View>
              )}
              <View style={styles.rowCopy}>
                <Text style={styles.name}>{item.displayName}</Text>
                {item.username ? (
                  <Text style={styles.username}>@{item.username}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => confirmUnblock(item)}
                disabled={Boolean(busyUserId)}
                style={({ pressed }) => [
                  styles.unblockButton,
                  pressed && styles.pressed,
                  busyUserId === item.userId && styles.disabled,
                ]}
              >
                {busyUserId === item.userId ? (
                  <ActivityIndicator size="small" color={COLORS.text} />
                ) : (
                  <Text style={styles.unblockText}>Unblock</Text>
                )}
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  topBarSide: { width: 52 },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
    color: COLORS.text,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateText: { fontFamily: 'Manrope_500Medium', color: COLORS.subtext },
  content: { padding: 16, paddingBottom: 42, gap: 10 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  intro: {
    marginBottom: 8,
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.subtext,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#ececec' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontFamily: 'Manrope_700Bold', color: COLORS.subtext },
  rowCopy: { flex: 1, marginLeft: 12 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: COLORS.text },
  username: { marginTop: 2, fontFamily: 'Manrope_500Medium', fontSize: 12, color: COLORS.subtext },
  unblockButton: {
    minWidth: 82,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  unblockText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: COLORS.text },
  emptyState: { alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { marginTop: 14, fontFamily: 'Manrope_700Bold', fontSize: 18, color: COLORS.text },
  emptyText: { marginTop: 7, textAlign: 'center', fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20, color: COLORS.subtext },
  errorText: { marginTop: 12, textAlign: 'center', color: '#b42318', fontFamily: 'Manrope_600SemiBold' },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.5 },
});
