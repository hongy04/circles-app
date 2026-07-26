import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { COLORS } from './src/theme/colors';
import { IS_DEVELOPMENT } from './src/config/env';
import { supabase } from './src/lib/supabase';
import { ensureAuthed } from './src/services/authService';
import { trackLaunchEvent } from './src/services/analyticsService';
import {
  FEATURE_FLAGS,
  loadFeatureFlags,
} from './src/services/featureFlagService';
import {
  getNotificationBadgeCount,
  subscribeToNotificationChanges,
} from './src/services/notificationService';
import { Avatar } from './src/components/Avatar';
import { DevBanner } from './src/components/DevBanner';
import { MonoRingWithRipples } from './src/components/MonoRingWithRipples';
import { AuthNavigator } from './src/navigation/AuthNavigator';
import { FeedScreen } from './src/screens/feed/FeedScreen';
import { CreatePostScreen } from './src/screens/posts/CreatePostScreen';
import { PostDetailScreen } from './src/screens/posts/PostDetailScreen';
import { EditPostScreen } from './src/screens/posts/EditPostScreen';
import { StoryComposerScreen } from './src/screens/stories/StoryComposerScreen';
import { MeScreen } from './src/screens/profile/MeScreen';
import { ProfileScreen } from './src/screens/profile/ProfileScreen';
import { ProfilePostsFeedScreen } from './src/screens/profile/ProfilePostsFeedScreen';
import { EditProfileScreen } from './src/screens/profile/EditProfileScreen';
import { AccountSettingsScreen } from './src/screens/profile/AccountSettingsScreen';
import { InvitePeopleScreen } from './src/screens/profile/InvitePeopleScreen';
import { InvitationLandingScreen } from './src/screens/invitations/InvitationLandingScreen';
import { EventGuestInvitationScreen } from './src/screens/invitations/EventGuestInvitationScreen';
import { DevAccountsScreen } from './src/screens/dev/DevAccountsScreen';
import { InboxScreen } from './src/screens/conversations/InboxScreen';
import { NotificationsScreen } from './src/screens/conversations/NotificationsScreen';
import { ConversationNotificationSettingsScreen } from './src/screens/conversations/ConversationNotificationSettingsScreen';
import { ChatScreen } from './src/screens/conversations/ChatScreen';
import { CreateGroupScreen } from './src/screens/conversations/CreateGroupScreen';
import { CircleProfileScreen } from './src/screens/conversations/CircleProfileScreen';
import { CirclePeopleScreen } from './src/screens/conversations/CirclePeopleScreen';
import { InviteCirclePeopleScreen } from './src/screens/conversations/InviteCirclePeopleScreen';
import { DirectConversationDetailsScreen } from './src/screens/conversations/DirectConversationDetailsScreen';
import { EditCircleScreen } from './src/screens/conversations/EditCircleScreen';
import { ConversationMediaViewerScreen } from './src/screens/conversations/ConversationMediaViewerScreen';
import { CreateCirclePostScreen } from './src/screens/conversations/CreateCirclePostScreen';
import { CirclePostDetailScreen } from './src/screens/conversations/CirclePostDetailScreen';
import { CirclePostsFeedScreen } from './src/screens/conversations/CirclePostsFeedScreen';
import { CircleTimelineFeedScreen } from './src/screens/conversations/CircleTimelineFeedScreen';
import { CircleEventsScreen } from './src/screens/conversations/CircleEventsScreen';
import { CreateEventScreen } from './src/screens/conversations/CreateEventScreen';
import { EventDetailScreen } from './src/screens/conversations/EventDetailScreen';
import { AddEventGuestScreen } from './src/screens/conversations/AddEventGuestScreen';
import { EventGuestSettingsScreen } from './src/screens/conversations/EventGuestSettingsScreen';
import { CreateAvailabilityPollScreen } from './src/screens/conversations/CreateAvailabilityPollScreen';
import { AvailabilityPollDetailScreen } from './src/screens/conversations/AvailabilityPollDetailScreen';
import { EditCirclePostScreen } from './src/screens/conversations/EditCirclePostScreen';
import { getInviteLinkingPrefixes } from './src/services/inviteService';
import { timeAgo } from './src/utils/timeAgo';

/* ---------------- Layout & helpers ---------------- */
const { width: W, height: H } = Dimensions.get('window');
const IS_SMALL = W < 360 || H < 720;

/* ---------------- Navigation ---------------- */
const RootStack = createNativeStackNavigator();
const CirclesStackNav = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const APP_LINKING = {
  prefixes: getInviteLinkingPrefixes(),
  config: {
    screens: {
      Invite: 'invite/:token',
      EventGuestInvite: 'event-guest/:token',
    },
  },
};

/* ---------------- App ---------------- */
export default function App() {
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold });
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer linking={APP_LINKING}>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Gate" component={GateScreen} />
          <RootStack.Screen name="Invite" component={InvitationLandingScreen} />
          <RootStack.Screen name="EventGuestInvite" component={EventGuestInvitationScreen} />
          <RootStack.Screen name="Auth" component={AuthNavigator} />
          <RootStack.Screen name="MainTabs" component={AppTabs} />
          <RootStack.Screen name="CreatePost" component={CreatePostScreen} />
          <RootStack.Screen name="CreateStory" component={StoryComposerScreen} />
          <RootStack.Screen name="Profile" component={ProfileScreen} />
          <RootStack.Screen name="ProfilePostsFeed" component={ProfilePostsFeedScreen} />
          <RootStack.Screen name="EditProfile" component={EditProfileScreen} />
          <RootStack.Screen name="AccountSettings" component={AccountSettingsScreen} />
          <RootStack.Screen name="InvitePeople" component={InvitePeopleScreen} />
          {IS_DEVELOPMENT ? (
            <RootStack.Screen name="DevAccounts" component={DevAccountsScreen} />
          ) : null}
          <RootStack.Screen name="PostDetail" component={PostDetailScreen} />
          <RootStack.Screen name="EditPost" component={EditPostScreen} />
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

/* ---------------- Gate / Portal ---------------- */
function GateScreen({ navigation }) {
  const { width: Ww, height: Hh } = Dimensions.get('window');
  const S = Math.min(Ww, Hh);
  const size = Math.round(S * (IS_SMALL ? 0.26 : 0.3));
  const portalScaleTarget = useMemo(() => (Math.hypot(Ww, Hh) / size) * 1.25, [size, Ww, Hh]);
  const [portal, setPortal] = useState(false);

  const goIn = async () => {
    await Haptics.selectionAsync();
    setPortal(true);
    setTimeout(() => navigation.replace('Auth'), 450);
  };

  return (
    <View style={styles.gateRoot}>
      <Pressable onPress={goIn} style={{ alignItems: 'center' }}>
        <MonoRingWithRipples size={size} />
        <Text style={styles.title}>Welcome to Circles</Text>
        <Text style={styles.subtitle}>Tap the circle to enter</Text>
      </Pressable>

      {portal ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.portalCenter}>
            <MotiView
              from={{ scale: 0, opacity: 0.9 }}
              animate={{ scale: portalScaleTarget, opacity: 0 }}
              transition={{ type: 'timing', duration: 450 }}
              style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.primary }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* ---------------- Tabs ---------------- */
function AppTabs() {
  const insets = useSafeAreaInsets();
  const [reqCount, setReqCount] = useState(0);
  const [circleBadgeCount, setCircleBadgeCount] = useState(0);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadCount = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const isAuthed = !!session;
        if (mounted) setAuthed(isAuthed);
        if (!isAuthed) {
          if (mounted) {
            setReqCount(IS_DEVELOPMENT ? 1 : 0);
            setCircleBadgeCount(0);
          }
          return;
        }

        const [requestResult, nextCircleBadgeCount] = await Promise.all([
          supabase.rpc('incoming_requests'),
          getNotificationBadgeCount(),
        ]);

        if (requestResult.error) throw requestResult.error;

        if (mounted) {
          setReqCount((requestResult.data || []).length);
          setCircleBadgeCount(nextCircleBadgeCount);
        }
      } catch {
        if (mounted) {
          setReqCount(0);
          setCircleBadgeCount(0);
        }
      }
    };
    loadCount();
    const ch = supabase.channel('relationship_tabbadges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connection_requests' }, () => loadCount())
      .subscribe();
    const unsubscribeNotifications = subscribeToNotificationChanges(loadCount);
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
      unsubscribeNotifications();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {IS_DEVELOPMENT && !authed ? <DevBanner /> : null}
      <Tabs.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: '#9e9e9e',
          tabBarStyle: {
            paddingBottom: Math.max(8, insets.bottom),
            paddingTop: 6,
            backgroundColor: COLORS.bg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: COLORS.border,
          },
          tabBarLabelStyle: { fontFamily: 'Manrope_600SemiBold', marginBottom: 4 },
          tabBarIcon: ({ color, size, focused }) => {
            const name =
              route.name === 'Circles' ? (focused ? 'chatbubbles' : 'chatbubbles-outline') :
              route.name === 'Mutuals' ? (focused ? 'people' : 'people-outline') :
              route.name === 'Feed'    ? (focused ? 'albums' : 'albums-outline') :
              route.name === 'Me'      ? (focused ? 'person' : 'person-outline') : 'ellipse';
            return (
              <View style={{ width: size, height: size }}>
                <Ionicons name={name} size={size} color={color} />
                {route.name === 'Mutuals' && reqCount > 0 ? (
                  <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{reqCount > 99 ? '99+' : String(reqCount)}</Text></View>
                ) : null}
                {route.name === 'Circles' && circleBadgeCount > 0 ? (
                  <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{circleBadgeCount > 99 ? '99+' : String(circleBadgeCount)}</Text></View>
                ) : null}
              </View>
            );
          },
        })}
        sceneContainerStyle={{ backgroundColor: COLORS.bg }}
      >
        <Tabs.Screen name="Circles" component={CirclesStack} />
        <Tabs.Screen name="Mutuals" component={MutualsScreen} />
        <Tabs.Screen name="Feed" component={FeedScreen} />
        <Tabs.Screen name="Me" component={MeScreen} />
      </Tabs.Navigator>
    </View>
  );
}

/* ---------------- Circles stack ---------------- */
function CirclesStack() {
  return (
    <CirclesStackNav.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: 'Manrope_700Bold', color: COLORS.text },
        headerTintColor: COLORS.text,
        headerBackTitleVisible: false,
        contentStyle: { backgroundColor: COLORS.bg },
      }}
    >
      <CirclesStackNav.Screen
        name="Inbox"
        component={InboxScreen}
        options={{ title: 'Circles' }}
      />
      <CirclesStackNav.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Notifications' }}
      />
      <CirclesStackNav.Screen
        name="ConversationNotificationSettings"
        component={ConversationNotificationSettingsScreen}
        options={{ title: 'Notifications' }}
      />
      <CirclesStackNav.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
      <CirclesStackNav.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={{ title: 'New Private Group' }}
      />
      <CirclesStackNav.Screen
        name="CircleProfile"
        component={CircleProfileScreen}
        options={{ title: 'Circle' }}
      />
      <CirclesStackNav.Screen
        name="CirclePeople"
        component={CirclePeopleScreen}
        options={{ title: 'People' }}
      />
      <CirclesStackNav.Screen
        name="CircleEvents"
        component={CircleEventsScreen}
        options={{ title: 'Plans & Events' }}
      />
      <CirclesStackNav.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{ title: 'New Event' }}
      />
      <CirclesStackNav.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ title: 'Event' }}
      />
      <CirclesStackNav.Screen
        name="AddEventGuest"
        component={AddEventGuestScreen}
        options={{ title: 'Invite Guest' }}
      />
      <CirclesStackNav.Screen
        name="EventGuestSettings"
        component={EventGuestSettingsScreen}
        options={{ title: 'Guest Settings' }}
      />
      <CirclesStackNav.Screen
        name="CreateAvailabilityPoll"
        component={CreateAvailabilityPollScreen}
        options={{ title: 'Poll Dates' }}
      />
      <CirclesStackNav.Screen
        name="AvailabilityPollDetail"
        component={AvailabilityPollDetailScreen}
        options={{ title: 'Availability' }}
      />
      <CirclesStackNav.Screen
        name="InviteCirclePeople"
        component={InviteCirclePeopleScreen}
        options={{ title: 'Invite People' }}
      />
      <CirclesStackNav.Screen
        name="CirclePostsFeed"
        component={CirclePostsFeedScreen}
        options={{ title: 'Posts' }}
      />
      <CirclesStackNav.Screen
        name="CircleTimelineFeed"
        component={CircleTimelineFeedScreen}
        options={{ title: 'Timeline' }}
      />
      <CirclesStackNav.Screen
        name="DirectConversationDetails"
        component={DirectConversationDetailsScreen}
        options={{ title: 'Details' }}
      />
      <CirclesStackNav.Screen
        name="EditCircle"
        component={EditCircleScreen}
        options={{ title: 'Edit Circle' }}
      />
      <CirclesStackNav.Screen
        name="CreateCirclePost"
        component={CreateCirclePostScreen}
        options={{ title: 'New Circle Post' }}
      />
      <CirclesStackNav.Screen
        name="CirclePostDetail"
        component={CirclePostDetailScreen}
        options={{ title: 'Circle Post' }}
      />
      <CirclesStackNav.Screen
        name="EditCirclePost"
        component={EditCirclePostScreen}
        options={{ title: 'Edit Circle Post' }}
      />
      <CirclesStackNav.Screen
        name="ConversationMedia"
        component={ConversationMediaViewerScreen}
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
    </CirclesStackNav.Navigator>
  );
}

/* ---------------- Mutuals ---------------- */
const MOCK_CANDIDATES = [
  {
    id: 'm1',
    display_name: 'Jordan Kim',
    avatar_url: 'https://i.pravatar.cc/150?img=11',
    since: new Date().toISOString(),
    preview_post_id: 'mock-preview-1',
    preview_caption: 'A quiet afternoon with people I care about.',
    preview_url: 'https://picsum.photos/seed/circles-mutual-preview/900/700',
    preview_media_type: 'image',
    preview_created_at: new Date().toISOString(),
    preview_media_count: 1,
  },
];
const MOCK_INCOMING = [
  { id: 'r1', from_user: 'uZ', display_name: 'Taylor Brooks', avatar_url: 'https://i.pravatar.cc/150?img=47', note: null, created_at: new Date().toISOString() },
];
const MOCK_CONNECTIONS = [
  { user_id: 'c1', display_name: 'Alex Rivera', username: 'alex', avatar_url: 'https://i.pravatar.cc/150?img=12' },
];

function MutualCandidateCard({ user, sending, onOpenProfile, onRequest }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasPreview = Boolean(user.preview_post_id);
  const isVideo = user.preview_media_type === 'video';
  const canShowImage = Boolean(user.preview_url) && !isVideo && !imageFailed;
  const previewHeight = Math.min(Math.max(Math.round((W - 48) * 0.72), 210), 360);
  const previewTime = user.preview_created_at
    ? timeAgo(user.preview_created_at)
    : '';

  useEffect(() => {
    setImageFailed(false);
  }, [user.preview_url]);

  if (!hasPreview) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.divider, borderRadius: 12 }}>
        <Pressable
          onPress={onOpenProfile}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
        >
          <Avatar size={48} name={user.display_name || 'Unknown'} uri={user.avatar_url} />
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={{ fontFamily: 'Manrope_700Bold', color: COLORS.text }} numberOfLines={1}>{user.display_name || 'Unknown'}</Text>
            <Text style={{ fontFamily: 'Manrope_400Regular', color: COLORS.subtext, fontSize: 12 }}>Mutual contact</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onRequest}
          disabled={sending}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: COLORS.primary,
            opacity: pressed || sending ? 0.7 : 1,
          })}
        >
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Manrope_700Bold' }}>Request</Text>}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.divider, borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        <Pressable
          onPress={onOpenProfile}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
        >
          <Avatar size={46} name={user.display_name || 'Unknown'} uri={user.avatar_url} />
          <View style={{ flex: 1, marginHorizontal: 11 }}>
            <Text style={{ fontFamily: 'Manrope_700Bold', color: COLORS.text }} numberOfLines={1}>
              {user.display_name || 'Unknown'}
            </Text>
            <Text style={{ fontFamily: 'Manrope_400Regular', color: COLORS.subtext, fontSize: 12 }} numberOfLines={1}>
              Mutual contact{previewTime ? ` · ${previewTime}` : ''}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={onRequest}
          disabled={sending}
          style={({ pressed }) => ({
            minWidth: 82,
            minHeight: 36,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: COLORS.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed || sending ? 0.7 : 1,
          })}
        >
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 12 }}>Request</Text>}
        </Pressable>
      </View>

      <Pressable
        onPress={onOpenProfile}
        style={({ pressed }) => ({
          height: previewHeight,
          backgroundColor: '#313131',
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons
            name={isVideo ? 'play-circle-outline' : 'image-outline'}
            size={48}
            color="#fff"
          />
          <Text style={{ color: '#fff', fontFamily: 'Manrope_600SemiBold', marginTop: 7 }}>
            {isVideo ? 'Video preview' : 'Post preview'}
          </Text>
        </View>

        {canShowImage ? (
          <Image
            source={{ uri: user.preview_url }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : null}

        <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.66)' }}>
          <Ionicons name="eye" size={13} color="#fff" />
          <Text style={{ color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 11 }}>Mutuals preview</Text>
        </View>

        {Number(user.preview_media_count || 0) > 1 ? (
          <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.66)' }}>
            <Ionicons name="copy-outline" size={13} color="#fff" />
            <Text style={{ color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 11 }}>{user.preview_media_count}</Text>
          </View>
        ) : null}
      </Pressable>

      <Pressable onPress={onOpenProfile} style={({ pressed }) => ({ paddingHorizontal: 13, paddingVertical: 12, opacity: pressed ? 0.65 : 1 })}>
        {user.preview_caption ? (
          <Text style={{ color: COLORS.text, fontFamily: 'Manrope_400Regular', lineHeight: 20 }} numberOfLines={3}>
            <Text style={{ fontFamily: 'Manrope_700Bold' }}>{user.display_name || 'Unknown'} </Text>
            {user.preview_caption}
          </Text>
        ) : (
          <Text style={{ color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12 }}>
            Open their private profile to request a connection.
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function MutualsScreen({ navigation, route }) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [connections, setConnections] = useState([]);
  const [sending, setSending] = useState({});
  const [responding, setResponding] = useState({});
  const [tab, setTab] = useState(route?.params?.initialTab || 'mutuals');
  const [authed, setAuthed] = useState(false);
  const hasTrackedOpen = useRef(false);

  useEffect(() => {
    if (route?.params?.initialTab) {
      setTab(route.params.initialTab);
    }
  }, [route?.params?.initialTab]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAuthed(!!session);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (IS_DEVELOPMENT) {
          setCandidates(MOCK_CANDIDATES);
          setIncoming(MOCK_INCOMING);
          setConnections(MOCK_CONNECTIONS);
        }
        return;
      }

      const [
        candidateResult,
        requestResult,
        connectionResult,
        featureFlags,
      ] = await Promise.all([
        supabase.rpc('mutual_candidates'),
        supabase.rpc('incoming_requests'),
        supabase.rpc('get_my_connections'),
        loadFeatureFlags(),
      ]);

      if (candidateResult.error) throw candidateResult.error;
      if (requestResult.error) throw requestResult.error;
      if (connectionResult.error) throw connectionResult.error;

      const previewEnabled =
        featureFlags[FEATURE_FLAGS.MUTUAL_PREVIEW_POSTS] !== false;
      const nextCandidates = (candidateResult.data || []).map((candidate) =>
        previewEnabled
          ? candidate
          : {
              ...candidate,
              preview_post_id: null,
              preview_caption: null,
              preview_url: null,
              preview_media_type: null,
              preview_created_at: null,
              preview_media_count: 0,
            }
      );
      const nextRequests = requestResult.data || [];
      const nextConnections = connectionResult.data || [];

      setCandidates(nextCandidates);
      setIncoming(nextRequests);
      setConnections(nextConnections);

      if (!hasTrackedOpen.current) {
        hasTrackedOpen.current = true;
        void trackLaunchEvent('mutuals_opened', {
          surface: 'mutuals',
          candidate_count: nextCandidates.length,
          request_count: nextRequests.length,
          connection_count: nextConnections.length,
        });
      }
    } catch (err) {
      Alert.alert('Could not load people', err?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!authed) return;
    const ch = supabase
      .channel('people_relationship_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connection_requests' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [authed]);

  const sendRequest = async (userId) => {
    if (!authed && IS_DEVELOPMENT) {
      setCandidates((current) => current.filter((user) => user.id !== userId));
      Alert.alert('DEV', 'Simulated request.');
      return;
    }

    setSending((current) => ({ ...current, [userId]: true }));
    try {
      await ensureAuthed();
      const { error } = await supabase.rpc('send_connection_request', {
        to_user_id: userId,
        note: null,
      });
      if (error) throw error;
      setCandidates((current) => current.filter((user) => user.id !== userId));
      void trackLaunchEvent('connection_request_sent', {
        surface: 'mutuals',
      });
    } catch (error) {
      Alert.alert('Could not send request', error?.message || 'Please try again.');
    } finally {
      setSending((current) => ({ ...current, [userId]: false }));
    }
  };

  const respond = async (requestId, action) => {
    if (!authed && IS_DEVELOPMENT) {
      setIncoming((current) => current.filter((request) => request.id !== requestId));
      Alert.alert('DEV', `Simulated ${action}.`);
      return;
    }

    setResponding((current) => ({ ...current, [requestId]: true }));
    try {
      await ensureAuthed();
      const { error } = await supabase.rpc('respond_connection_request', {
        req_id: requestId,
        action,
      });
      if (error) throw error;
      void trackLaunchEvent('connection_request_responded', {
        surface: 'mutuals',
        action,
      });
      await load();
    } catch (error) {
      Alert.alert('Could not update request', error?.message || 'Please try again.');
    } finally {
      setResponding((current) => ({ ...current, [requestId]: false }));
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const segmentItems = [
    { key: 'mutuals', label: 'Mutuals' },
    { key: 'requests', label: incoming.length ? `Requests (${incoming.length})` : 'Requests' },
    { key: 'connections', label: 'Connections' },
  ];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 24 }}>People</Text>
          <Text style={{ color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12, marginTop: 2 }}>
            Mutual context first. Access only after connection.
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('InvitePeople')}
          style={({ pressed }) => ({
            minHeight: 40,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Ionicons name="person-add-outline" size={18} color={COLORS.text} />
          <Text style={{ color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 12 }}>Invite</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', margin: 12, backgroundColor: '#f2f2f2', borderRadius: 10 }}>
        {segmentItems.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 10,
              alignItems: 'center',
              backgroundColor: tab === item.key ? COLORS.primary : 'transparent',
              borderRadius: 10,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                color: tab === item.key ? '#fff' : COLORS.text,
                fontFamily: 'Manrope_700Bold',
                fontSize: 12,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'mutuals' ? (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
          {candidates.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 38, paddingHorizontal: 24 }}>
              <Ionicons name="people-outline" size={38} color={COLORS.subtext} />
              <Text style={{ marginTop: 10, textAlign: 'center', color: COLORS.text, fontFamily: 'Manrope_700Bold' }}>
                No mutuals yet
              </Text>
              <Text style={{ marginTop: 5, textAlign: 'center', color: COLORS.subtext, fontFamily: 'Manrope_400Regular', lineHeight: 19 }}>
                Sync contacts or invite people you already know. Profiles remain private until both people connect.
              </Text>
              <Pressable
                onPress={() => navigation.navigate('InvitePeople')}
                style={({ pressed }) => ({
                  marginTop: 16,
                  minHeight: 42,
                  borderRadius: 11,
                  backgroundColor: COLORS.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 18,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: '#fff', fontFamily: 'Manrope_700Bold' }}>Invite people</Text>
              </Pressable>
            </View>
          ) : candidates.map((user) => (
            <MutualCandidateCard
              key={user.id}
              user={user}
              sending={Boolean(sending[user.id])}
              onOpenProfile={() => navigation.navigate('Profile', { userId: user.id })}
              onRequest={() => sendRequest(user.id)}
            />
          ))}
        </ScrollView>
      ) : tab === 'requests' ? (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
          {incoming.length === 0 ? (
            <Text style={{ textAlign: 'center', color: COLORS.subtext, fontFamily: 'Manrope_400Regular', paddingTop: 38 }}>No requests right now.</Text>
          ) : incoming.map((request) => (
            <View key={request.id} style={{ padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.divider, borderRadius: 12 }}>
              <Pressable
                onPress={() => navigation.navigate('Profile', { userId: request.from_user })}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <Avatar size={48} name={request.display_name || 'Unknown'} uri={request.avatar_url} />
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={{ fontFamily: 'Manrope_700Bold', color: COLORS.text }} numberOfLines={1}>{request.display_name || 'Unknown'}</Text>
                  <Text style={{ fontFamily: 'Manrope_400Regular', color: COLORS.subtext, fontSize: 12 }}>wants to connect</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Pressable
                  onPress={() => respond(request.id, 'accept')}
                  disabled={Boolean(responding[request.id])}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: COLORS.primary,
                    alignItems: 'center',
                    opacity: pressed || responding[request.id] ? 0.7 : 1,
                  })}
                >
                  {responding[request.id] ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Manrope_700Bold' }}>Accept</Text>}
                </Pressable>
                <Pressable
                  onPress={() => respond(request.id, 'decline')}
                  disabled={Boolean(responding[request.id])}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignItems: 'center',
                    opacity: pressed || responding[request.id] ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: COLORS.text, fontFamily: 'Manrope_700Bold' }}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
          {connections.length === 0 ? (
            <Text style={{ textAlign: 'center', color: COLORS.subtext, fontFamily: 'Manrope_400Regular', paddingTop: 38 }}>
              Accepted connections will appear here.
            </Text>
          ) : connections.map((person) => (
            <Pressable
              key={person.user_id}
              onPress={() => navigation.navigate('Profile', { userId: person.user_id })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: COLORS.divider,
                borderRadius: 12,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Avatar size={48} name={person.display_name || 'Connection'} uri={person.avatar_url} />
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={{ fontFamily: 'Manrope_700Bold', color: COLORS.text }} numberOfLines={1}>
                  {person.display_name || 'Connection'}
                </Text>
                <Text style={{ fontFamily: 'Manrope_400Regular', color: COLORS.subtext, fontSize: 12 }} numberOfLines={1}>
                  {person.username ? `@${person.username}` : 'Accepted connection'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ---------------- Small UI components ---------------- */



/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  gateRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  title: { marginTop: 22, fontFamily: 'Manrope_700Bold', fontSize: 22, color: COLORS.text },
  subtitle: { marginTop: 6, fontFamily: 'Manrope_400Regular', color: COLORS.subtext },
  portalCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },


  tabBadge: { position: 'absolute', right: -6, top: -4, backgroundColor: '#000', minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Manrope_700Bold' },



});
