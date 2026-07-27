import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import { fetchProfileConnectionDirectory } from '../../services/profileDirectoryService';

function ConnectionRow({ person, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
    >
      <Avatar
        size={50}
        name={person.displayName}
        uri={person.avatarUrl}
      />
      <View style={styles.personCopy}>
        <Text style={styles.personName} numberOfLines={1}>{person.displayName}</Text>
        <Text style={styles.personMeta} numberOfLines={1}>
          {person.username ? `@${person.username}` : 'Accepted connection'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
    </Pressable>
  );
}

export function ProfileConnectionsScreen({ route, navigation }) {
  const userId = route?.params?.userId || null;
  const profileName = route?.params?.profileName || 'Profile';
  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      setDirectory(await fetchProfileConnectionDirectory(userId));
    } catch (loadError) {
      setError(loadError?.message || 'Could not load connections.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    navigation.setOptions({
      title: userId ? `Mutuals with ${profileName}` : 'Connections',
    });
    load();
  }, [load, navigation, profileName, userId]);

  if (loading && !directory) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading connections…</Text>
      </View>
    );
  }

  if (error && !directory) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={38} color={COLORS.subtext} />
        <Text style={styles.errorTitle}>Connections unavailable</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const isSelf = directory?.mode === 'connections';
  const people = directory?.people || [];

  return (
    <FlatList
      style={styles.screen}
      data={people}
      keyExtractor={(person) => person.userId}
      renderItem={({ item }) => (
        <ConnectionRow
          person={item}
          onPress={() => navigation.navigate('Profile', { userId: item.userId })}
        />
      )}
      ListHeaderComponent={(
        <View style={styles.introCard}>
          <Ionicons
            name={isSelf ? 'people-outline' : 'git-network-outline'}
            size={25}
            color={COLORS.text}
          />
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>
              {isSelf ? 'Your accepted connections' : 'People you both know'}
            </Text>
            <Text style={styles.introBody}>
              {isSelf
                ? 'This complete directory is visible only to you.'
                : 'Only people whom both of you have already accepted are visible. Their full network remains private.'}
            </Text>
          </View>
        </View>
      )}
      ListEmptyComponent={(
        <View style={styles.emptyRoot}>
          <Ionicons name="people-outline" size={36} color={COLORS.subtext} />
          <Text style={styles.emptyTitle}>
            {isSelf ? 'No connections yet' : 'No mutual connections'}
          </Text>
          <Text style={styles.emptyBody}>
            {isSelf
              ? 'Accepted connections will appear here instead of in the Mutuals tab.'
              : 'Neither person’s unrelated connections are exposed.'}
          </Text>
        </View>
      )}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load({ refresh: true })}
          tintColor={COLORS.text}
        />
      )}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 48,
    gap: 10,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorTitle: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
  },
  errorBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  introCard: {
    flexDirection: 'row',
    padding: 16,
    marginBottom: 6,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  introCopy: { flex: 1, marginLeft: 12 },
  introTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  introBody: {
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: 12,
    backgroundColor: COLORS.bg,
  },
  personCopy: { flex: 1, marginHorizontal: 12 },
  personName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  personMeta: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  emptyRoot: {
    flex: 1,
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyTitle: {
    marginTop: 10,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  pressed: { opacity: 0.68 },
});
