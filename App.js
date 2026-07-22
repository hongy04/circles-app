import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View
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
import { DevAccountsScreen } from './src/screens/dev/DevAccountsScreen';
import { InboxScreen } from './src/screens/conversations/InboxScreen';
import { ChatScreen } from './src/screens/conversations/ChatScreen';
import { CreateGroupScreen } from './src/screens/conversations/CreateGroupScreen';
import { CircleProfileScreen } from './src/screens/conversations/CircleProfileScreen';
import { DirectConversationDetailsScreen } from './src/screens/conversations/DirectConversationDetailsScreen';
import { EditCircleScreen } from './src/screens/conversations/EditCircleScreen';
import { ConversationMediaViewerScreen } from './src/screens/conversations/ConversationMediaViewerScreen';
import { CreateCirclePostScreen } from './src/screens/conversations/CreateCirclePostScreen';
import { CirclePostDetailScreen } from './src/screens/conversations/CirclePostDetailScreen';
import { CirclePostsFeedScreen } from './src/screens/conversations/CirclePostsFeedScreen';
import { CircleTimelineFeedScreen } from './src/screens/conversations/CircleTimelineFeedScreen';
import { EditCirclePostScreen } from './src/screens/conversations/EditCirclePostScreen';

/* ---------------- Layout & helpers ---------------- */
const { width: W, height: H } = Dimensions.get('window');
const IS_SMALL = W < 360 || H < 720;

/* ---------------- Navigation ---------------- */
const RootStack = createNativeStackNavigator();
const CirclesStackNav = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

/* ---------------- App ---------------- */
export default function App() {
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold });
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Gate" component={GateScreen} />
          <RootStack.Screen name="Auth" component={AuthNavigator} />
          <RootStack.Screen name="MainTabs" component={AppTabs} />
          <RootStack.Screen name="CreatePost" component={CreatePostScreen} />
          <RootStack.Screen name="CreateStory" component={StoryComposerScreen} />
          <RootStack.Screen name="Profile" component={ProfileScreen} />
          <RootStack.Screen name="ProfilePostsFeed" component={ProfilePostsFeedScreen} />
          <RootStack.Screen name="EditProfile" component={EditProfileScreen} />
          <RootStack.Screen name="AccountSettings" component={AccountSettingsScreen} />
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
  const [conversationInviteCount, setConversationInviteCount] = useState(0);
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
            setConversationInviteCount(0);
          }
          return;
        }

        const [requestResult, invitationResult] = await Promise.all([
          supabase.rpc('incoming_requests'),
          supabase.rpc('get_my_conversation_invitations'),
        ]);

        if (requestResult.error) throw requestResult.error;
        if (invitationResult.error) throw invitationResult.error;

        if (mounted) {
          setReqCount((requestResult.data || []).length);
          setConversationInviteCount((invitationResult.data || []).length);
        }
      } catch {
        if (mounted) {
          setReqCount(0);
          setConversationInviteCount(0);
        }
      }
    };
    loadCount();
    const ch = supabase.channel('relationship_tabbadges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connection_requests' }, () => loadCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_invitations' }, () => loadCount())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
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
                {route.name === 'Circles' && conversationInviteCount > 0 ? (
                  <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{conversationInviteCount > 99 ? '99+' : String(conversationInviteCount)}</Text></View>
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
  { id: 'm1', display_name: 'Jordan Kim', avatar_url: 'https://i.pravatar.cc/150?img=11', since: new Date().toISOString() },
];
const MOCK_INCOMING = [
  { id: 'r1', from_user: 'uZ', display_name: 'Taylor Brooks', avatar_url: 'https://i.pravatar.cc/150?img=47', note: null, created_at: new Date().toISOString() },
];

function MutualsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [sending, setSending] = useState({});
  const [responding, setResponding] = useState({});
  const [tab, setTab] = useState('forYou');
  const [authed, setAuthed] = useState(false);

  useEffect(() => { (async () => { const { data: { session } } = await supabase.auth.getSession(); setAuthed(!!session); })(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (IS_DEVELOPMENT) { setCandidates(MOCK_CANDIDATES); setIncoming(MOCK_INCOMING); } return; }
      const [{ data: cand }, { data: reqs }] = await Promise.all([
        supabase.rpc('mutual_candidates'),
        supabase.rpc('incoming_requests'),
      ]);
      setCandidates(cand || []);
      setIncoming(reqs || []);
    } catch (err) {
      alert(err.message || 'Failed to load mutuals');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!authed) return;
    const ch = supabase
      .channel('connreqs_mutuals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connection_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [authed]);

  const sendRequest = async (userId) => {
    if (!authed && IS_DEVELOPMENT) { setCandidates(prev => prev.filter(u => u.id !== userId)); Alert.alert('DEV', 'Simulated request.'); return; }
    setSending(s => ({ ...s, [userId]: true }));
    try {
      await ensureAuthed();
      const { error } = await supabase.rpc('send_connection_request', { to_user_id: userId });
      if (error) throw error;
      setCandidates(prev => prev.filter(u => u.id !== userId));
    } catch (e) { alert(e.message || 'Failed to send request'); }
    finally { setSending(s => ({ ...s, [userId]: false })); }
  };

  const respond = async (reqId, action) => {
    if (!authed && IS_DEVELOPMENT) { setIncoming(prev => prev.filter(r => r.id !== reqId)); Alert.alert('DEV', `Simulated ${action}.`); return; }
    setResponding(s => ({ ...s, [reqId]: true }));
    try {
      await ensureAuthed();
      const { error } = await supabase.rpc('respond_connection_request', { req_id: reqId, action });
      if (error) throw error;
      setIncoming(prev => prev.filter(r => r.id !== reqId));
    } catch (e) { alert(e.message || 'Failed to update request'); }
    finally { setResponding(s => ({ ...s, [reqId]: false })); }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flexDirection: 'row', margin: 12, backgroundColor: '#f2f2f2', borderRadius: 10 }}>
        {(['forYou','requests']).map(k => (
          <Pressable key={k} onPress={() => setTab(k)} style={({pressed}) => ({
            flex:1, paddingVertical:10, alignItems:'center',
            backgroundColor: tab===k ? COLORS.primary : 'transparent',
            borderRadius:10, opacity: pressed?0.9:1
          })}>
            <Text style={{ color: tab===k ? '#fff' : COLORS.text, fontFamily:'Manrope_700Bold' }}>
              {k==='forYou' ? 'For You' : `Requests${incoming.length ? ` (${incoming.length})` : ''}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab==='forYou' ? (
        <ScrollView contentContainerStyle={{ padding:12, gap:12 }}>
          {candidates.length === 0 ? (
            <Text style={{ textAlign:'center', color:COLORS.subtext, fontFamily:'Manrope_400Regular' }}>
              No mutuals yet. Upload contacts to grow your circle.
            </Text>
          ) : candidates.map(u => (
            <View key={u.id} style={{ flexDirection:'row', alignItems:'center', padding:12, borderWidth:StyleSheet.hairlineWidth, borderColor:COLORS.divider, borderRadius:12 }}>
              <Pressable
                onPress={() => navigation.navigate('Profile', { userId: u.id })}
                style={{ flex:1, flexDirection:'row', alignItems:'center' }}
              >
                <Avatar size={48} name={u.display_name || 'Unknown'} uri={u.avatar_url} />
                <View style={{ flex:1, marginHorizontal:12 }}>
                  <Text style={{ fontFamily:'Manrope_700Bold', color:COLORS.text }} numberOfLines={1}>{u.display_name || 'Unknown'}</Text>
                  <Text style={{ fontFamily:'Manrope_400Regular', color:COLORS.subtext, fontSize:12 }}>Mutual contact</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => sendRequest(u.id)} disabled={!!sending[u.id]} style={({pressed}) => ({
                paddingHorizontal:14, paddingVertical:8, borderRadius:10,
                backgroundColor:COLORS.primary, opacity: pressed||sending[u.id] ? 0.7 : 1
              })}>
                {sending[u.id] ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontFamily:'Manrope_700Bold' }}>Request</Text>}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding:12, gap:12 }}>
          {incoming.length === 0 ? (
            <Text style={{ textAlign:'center', color:COLORS.subtext, fontFamily:'Manrope_400Regular' }}>No requests right now.</Text>
          ) : incoming.map(r => (
            <View key={r.id} style={{ padding:12, borderWidth:StyleSheet.hairlineWidth, borderColor:COLORS.divider, borderRadius:12 }}>
              <Pressable
                onPress={() => navigation.navigate('Profile', { userId: r.from_user })}
                style={{ flexDirection:'row', alignItems:'center' }}
              >
                <Avatar size={48} name={r.display_name || 'Unknown'} uri={r.avatar_url} />
                <View style={{ flex:1, marginHorizontal:12 }}>
                  <Text style={{ fontFamily:'Manrope_700Bold', color:COLORS.text }} numberOfLines={1}>{r.display_name || 'Unknown'}</Text>
                  <Text style={{ fontFamily:'Manrope_400Regular', color:COLORS.subtext, fontSize:12 }}>wants to connect</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
              </Pressable>
              <View style={{ flexDirection:'row', gap:10, marginTop:10 }}>
                <Pressable onPress={() => respond(r.id,'accept')} disabled={!!responding[r.id]} style={({pressed}) => ({
                  flex:1, paddingVertical:10, borderRadius:10, backgroundColor:COLORS.primary, alignItems:'center',
                  opacity: pressed||responding[r.id] ? 0.7 : 1
                })}>
                  {responding[r.id] ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontFamily:'Manrope_700Bold' }}>Accept</Text>}
                </Pressable>
                <Pressable onPress={() => respond(r.id,'decline')} disabled={!!responding[r.id]} style={({pressed}) => ({
                  flex:1, paddingVertical:10, borderRadius:10, borderWidth:1, borderColor:COLORS.border, alignItems:'center',
                  opacity: pressed||responding[r.id] ? 0.7 : 1
                })}>
                  <Text style={{ color:COLORS.text, fontFamily:'Manrope_700Bold' }}>Decline</Text>
                </Pressable>
              </View>
            </View>
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
