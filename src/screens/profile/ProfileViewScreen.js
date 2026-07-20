import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { ProfilePostGridItem } from '../../components/profile/ProfilePostGridItem';
import {
  fetchProfilePage,
  respondToProfileRequest,
  sendProfileConnectionRequest,
} from '../../services/profileService';

function TopBar({ isSelf, profile, navigation }) {
  const title = isSelf
    ? profile?.username
      ? `@${profile.username}`
      : 'Your profile'
    : profile?.username
      ? `@${profile.username}`
      : profile?.display_name || 'Profile';

  return (
    <View style={styles.topBar}>
      <View style={styles.topBarSide}>
        {!isSelf ? (
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={styles.iconButton}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.topBarTitle} numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.topBarSide, styles.topBarRight]}>
        {isSelf ? (
          <Pressable
            onPress={() => navigation.navigate('AccountSettings')}
            hitSlop={10}
            style={styles.iconButton}
          >
            <Ionicons name="settings-outline" size={22} color={COLORS.text} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function EmptyPosts({ isSelf, canViewPosts, onCreatePost }) {
  if (!canViewPosts) {
    return (
      <View style={styles.emptyRoot}>
        <Ionicons name="lock-closed-outline" size={34} color={COLORS.subtext} />
        <Text style={styles.emptyTitle}>Private posts</Text>
        <Text style={styles.emptyText}>
          Connect with this person to see what they share with their circles.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyRoot}>
      <Ionicons
        name={isSelf ? 'images-outline' : 'camera-outline'}
        size={36}
        color={COLORS.subtext}
      />
      <Text style={styles.emptyTitle}>
        {isSelf ? 'Share your first moment' : 'No posts yet'}
      </Text>
      <Text style={styles.emptyText}>
        {isSelf
          ? 'Your posts will appear here for the people in your circles.'
          : 'Their posts will appear here when they share something.'}
      </Text>

      {isSelf ? (
        <Pressable
          onPress={onCreatePost}
          style={({ pressed }) => [
            styles.emptyButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.emptyButtonText}>Create a post</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ProfileViewScreen({ navigation, userId, isSelf = false }) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError('');

    try {
      const result = await fetchProfilePage(userId);
      setProfile(result.profile);
      setPosts(result.posts);
    } catch (loadError) {
      setError(loadError?.message || 'Failed to load profile.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      load({ refresh: true });
    });

    return unsubscribe;
  }, [navigation, load]);

  const resolvedIsSelf = isSelf || profile?.relationship_status === 'self';

  const handleConnect = async () => {
    if (!profile?.id || actionBusy) return;

    setActionBusy(true);
    try {
      await sendProfileConnectionRequest(profile.id);
      await load({ refresh: true });
    } catch (actionError) {
      Alert.alert(
        'Could not send request',
        actionError?.message || 'Please try again.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleRespond = async (action) => {
    if (!profile?.request_id || actionBusy) return;

    setActionBusy(true);
    try {
      await respondToProfileRequest(profile.request_id, action);
      await load({ refresh: true });
    } catch (actionError) {
      Alert.alert(
        'Could not update request',
        actionError?.message || 'Please try again.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const header = profile ? (
    <>
      <TopBar
        isSelf={resolvedIsSelf}
        profile={profile}
        navigation={navigation}
      />

      <ProfileHeader
        profile={profile}
        isSelf={resolvedIsSelf}
        busy={actionBusy}
        onEdit={() => navigation.navigate('EditProfile')}
        onConnect={handleConnect}
        onAccept={() => handleRespond('accept')}
        onDecline={() => handleRespond('decline')}
      />

      <View style={styles.gridHeading}>
        <Ionicons name="grid-outline" size={18} color={COLORS.text} />
        <Text style={styles.gridHeadingText}>Posts</Text>
      </View>
    </>
  ) : null;

  if (loading && !profile) {
    return (
      <SafeAreaView edges={['top']} style={styles.centeredRoot}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </SafeAreaView>
    );
  }

  if (error && !profile) {
    return (
      <SafeAreaView edges={['top']} style={styles.centeredRoot}>
        {!isSelf ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.errorBack}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
        ) : null}
        <Ionicons name="alert-circle-outline" size={38} color={COLORS.subtext} />
        <Text style={styles.emptyTitle}>Profile unavailable</Text>
        <Text style={styles.emptyText}>{error}</Text>
        <Pressable
          onPress={() => load()}
          style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
        >
          <Text style={styles.emptyButtonText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View
        style={styles.contentWidth}
        onLayout={(event) => {
          const nextWidth = Math.floor(event.nativeEvent.layout.width);
          setGridWidth((currentWidth) =>
            currentWidth === nextWidth ? currentWidth : nextWidth
          );
        }}
      >
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <ProfilePostGridItem
              post={item}
              size={gridWidth > 0 ? Math.floor(gridWidth / 3) : undefined}
              onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
            />
          )}
          ListEmptyComponent={(
            <EmptyPosts
              isSelf={resolvedIsSelf}
              canViewPosts={Boolean(profile?.can_view_posts)}
              onCreatePost={() => navigation.navigate('CreatePost')}
            />
          )}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ refresh: true })}
              tintColor={COLORS.text}
            />
          )}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  contentWidth: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderLeftWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
    borderRightWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
    borderColor: COLORS.border,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 42,
  },
  gridRow: {
    alignItems: 'flex-start',
  },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  topBarSide: {
    width: 46,
    alignItems: 'flex-start',
  },
  topBarRight: {
    alignItems: 'flex-end',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridHeading: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  gridHeadingText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  centeredRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    paddingHorizontal: 28,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorBack: {
    position: 'absolute',
    top: 8,
    left: 10,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRoot: {
    minHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingVertical: 34,
  },
  emptyTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    marginTop: 12,
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 7,
    maxWidth: 360,
  },
  emptyButton: {
    minHeight: 42,
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  pressed: {
    opacity: 0.72,
  },
});
