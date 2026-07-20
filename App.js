import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
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
import { uploadToBucket } from './src/services/uploadService';
import { Avatar } from './src/components/Avatar';
import { DevBanner } from './src/components/DevBanner';
import { MonoRingWithRipples } from './src/components/MonoRingWithRipples';
import { UnreadBadge } from './src/components/UnreadBadge';
import { AuthNavigator } from './src/navigation/AuthNavigator';
import { FeedScreen } from './src/screens/feed/FeedScreen';
import { CreatePostScreen } from './src/screens/posts/CreatePostScreen';
import { PostDetailScreen } from './src/screens/posts/PostDetailScreen';
import { StoryComposerScreen } from './src/screens/stories/StoryComposerScreen';

/* ---------------- Layout & helpers ---------------- */
const { width: W, height: H } = Dimensions.get('window');
const IS_SMALL = W < 360 || H < 720;

function randomId() { return Math.random().toString(36).slice(2); }

/* ---------------- Demo data for Inbox ---------------- */
const USERS = {
  u1: { id: 'u1', name: 'You',            avatarUri: 'https://i.pravatar.cc/150?img=1' },
  u2: { id: 'u2', name: 'Alex Johnson',   avatarUri: 'https://i.pravatar.cc/150?img=5' },
  u3: { id: 'u3', name: 'Sam Lee',        avatarUri: 'https://i.pravatar.cc/150?img=15' },
  u4: { id: 'u4', name: 'Maya Patel',     avatarUri: 'https://i.pravatar.cc/150?img=22' },
};
const GROUPS = [
  { id: '1', name: 'Best Friends',    members: ['u1', 'u2', 'u3'], avatarUri: null,               last: 'See you at 7? I can drive.', time: '2m', unread: 3, pinned: true },
  { id: '2', name: 'Family',          members: ['u1', 'u4'],       avatarUri: null,               last: 'Mom sent a photo 📸',       time: '12m', unread: 0, pinned: true },
  { id: '3', name: 'Basketball Crew', members: ['u1','u2'],        avatarUri: null,               last: 'Court is open this wknd',   time: '1h', unread: 1, pinned: false },
  { id: '4', name: 'College',         members: ['u1','u3','u4'],   avatarUri: USERS.u2.avatarUri, last: 'Assignment due Mon',        time: '3h', unread: 0, pinned: false },
  { id: '5', name: 'Gaming',          members: ['u1','u2'],        avatarUri: USERS.u3.avatarUri, last: 'Queue later? 🎮',           time: 'Yesterday', unread: 0, pinned: false },
];

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
          <RootStack.Screen name="EditProfile" component={EditProfileScreen} />
          <RootStack.Screen name="PostDetail" component={PostDetailScreen} />
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
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadCount = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const isAuthed = !!session;
        if (mounted) setAuthed(isAuthed);
        if (!isAuthed) { if (IS_DEVELOPMENT) setReqCount(1); else setReqCount(0); return; }
        const { data, error } = await supabase.rpc('incoming_requests');
        if (error) throw error;
        if (mounted) setReqCount((data || []).length);
      } catch { if (mounted) setReqCount(0); }
    };
    loadCount();
    const ch = supabase.channel('connreqs_tabbadge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connection_requests' }, () => loadCount())
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
      <CirclesStackNav.Screen name="Inbox" component={InboxScreen} options={{ title: 'Circles' }} />
      <CirclesStackNav.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params?.name || 'Chat' })} />
      <CirclesStackNav.Screen name="GroupDetails" component={GroupDetailsScreen} options={{ title: 'Details' }} />
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

function MutualsScreen() {
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
              <Avatar size={48} name={u.display_name || 'Unknown'} uri={u.avatar_url} />
              <View style={{ flex:1, marginHorizontal:12 }}>
                <Text style={{ fontFamily:'Manrope_700Bold', color:COLORS.text }} numberOfLines={1}>{u.display_name || 'Unknown'}</Text>
                <Text style={{ fontFamily:'Manrope_400Regular', color:COLORS.subtext, fontSize:12 }}>Mutual contact</Text>
              </View>
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
              <View style={{ flexDirection:'row', alignItems:'center' }}>
                <Avatar size={48} name={r.display_name || 'Unknown'} uri={r.avatar_url} />
                <View style={{ flex:1, marginHorizontal:12 }}>
                  <Text style={{ fontFamily:'Manrope_700Bold', color:COLORS.text }} numberOfLines={1}>{r.display_name || 'Unknown'}</Text>
                  <Text style={{ fontFamily:'Manrope_400Regular', color:COLORS.subtext, fontSize:12 }}>wants to connect</Text>
                </View>
              </View>
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

/* ---------------- Inbox / Chat / GroupDetails ---------------- */
function InboxScreen({ navigation }) {
  const [convos, setConvos] = useState(GROUPS);
  const togglePin = async (id) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConvos((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)).sort(sortConvos));
  };
  const openConversation = async (c) => { await Haptics.selectionAsync(); navigation.navigate('Chat', { groupId: c.id, name: c.name }); };
  const pinned = convos.filter((c) => c.pinned);
  const others = convos.filter((c) => !c.pinned);

  return (
    <View style={styles.inboxRoot}>
      {pinned.length > 0 && (
        <View style={styles.pinnedWrap}>
          <View style={styles.pinnedGrid}>
            {pinned.map((c) => (
              <View key={c.id} style={styles.pinnedCell}>
                <Pressable onPress={() => openConversation(c)} onLongPress={() => togglePin(c.id)} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                  <Avatar size={IS_SMALL ? 64 : 72} name={c.name} uri={c.avatarUri} ripple />
                </Pressable>
                <Text style={styles.pinnedLabel} numberOfLines={2}>{c.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      <View style={styles.listWrap}>
        {others.map((c) => (
          <Pressable key={c.id} onPress={() => openConversation(c)} onLongPress={() => togglePin(c.id)} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}>
            <Avatar size={IS_SMALL ? 48 : 54} name={c.name} uri={c.avatarUri} ripple={c.unread > 0} />
            <View style={styles.rowCenter}>
              <Text style={styles.rowTitle} numberOfLines={1}>{c.name}</Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>{c.last}</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowTime}>{c.time}</Text>
              {c.unread > 0 ? <UnreadBadge count={c.unread} /> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ChatScreen({ route, navigation }) {
  const { groupId } = route.params || {};
  const group = GROUPS.find((g) => g.id === groupId) || GROUPS[0];
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [sessionUserId, setSessionUserId] = useState(null);
  const typingTimerRef = useRef(null);
  const presenceRef = useRef(null);
  const listRef = useRef(null);
  const seenIdsRef = useRef(new Set());

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('GroupDetails', { groupId })} hitSlop={10}>
          <Ionicons name="ellipsis-horizontal-circle" size={22} color={COLORS.text} />
        </Pressable>
      ),
      title: group.name,
    });
  }, [navigation, groupId]);

  useEffect(() => {
    let channel;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const isAuthed = !!session;
      setAuthed(isAuthed);
      setSessionUserId(session?.user?.id || null);

      if (!isAuthed) {
        const seed = [
          { id: 'm2', user_id: 'you', body: 'Testing messages locally 👋', created_at: new Date(Date.now()-1000*60*4).toISOString() },
          { id: 'm1', user_id: 'friend', body: `Welcome to ${group.name}!`, created_at: new Date(Date.now()-1000*60*5).toISOString() },
        ];
        seed.forEach(m => seenIdsRef.current.add(m.id));
        setMessages(seed);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id, user_id, body, created_at')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false });
        if (error) throw error;

        (data || []).forEach(m => seenIdsRef.current.add(m.id));
        setMessages(data || []);

        channel = supabase
          .channel(`messages_${groupId}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` }, (payload) => {
            const row = payload.new;
            if (seenIdsRef.current.has(row.id)) return;
            seenIdsRef.current.add(row.id);
            setMessages(prev => [row, ...prev]);
          })
          .subscribe();

        const key = session.user.id;
        const presence = supabase.channel(`typing_${groupId}`, { config: { presence: { key } } });
        presence.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await presence.track({ typing: false, display_name: 'You' });
        });
        presenceRef.current = presence;
      } catch {
        setAuthed(false);
        const seed = [
          { id: 'm2', user_id: 'you', body: 'Testing messages locally 👋', created_at: new Date(Date.now()-1000*60*4).toISOString() },
          { id: 'm1', user_id: 'friend', body: `Welcome to ${group.name}!`, created_at: new Date(Date.now()-1000*60*5).toISOString() },
        ];
        seed.forEach(m => seenIdsRef.current.add(m.id));
        setMessages(seed);
      }
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (presenceRef.current) supabase.removeChannel(presenceRef.current);
    };
  }, [groupId]);

  useEffect(() => { setTimeout(() => listRef.current?.scrollToOffset?.({ offset: 0, animated: true }), 0); }, [messages.length]);

  const handleChangeText = (t) => {
    setInput(t);
    const presence = presenceRef.current;
    if (!authed || !presence) return;
    presence.track({ typing: true, display_name: 'You' }).catch(() => {});
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { presence.track({ typing: false, display_name: 'You' }).catch(() => {}); }, 1200);
  };

  const fmtHM = (ts) => {
    const d = new Date(ts); const h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
    const hh = ((h + 11) % 12) + 1; const ampm = h < 12 ? 'AM' : 'PM'; return `${hh}:${m} ${ampm}`;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await Haptics.selectionAsync();

    if (!authed) {
      const local = { id: randomId(), user_id: 'you', body: text, created_at: new Date().toISOString() };
      seenIdsRef.current.add(local.id);
      setMessages(prev => [local, ...prev]);
      return;
    }

    setSending(true);
    try {
      const { user } = await ensureAuthed();
      const { data: row, error } = await supabase
        .from('messages')
        .insert({ group_id: groupId, user_id: user.id, body: text })
        .select('id, user_id, body, created_at')
        .single();
      if (error) throw error;
      if (!seenIdsRef.current.has(row.id)) {
        seenIdsRef.current.add(row.id);
        setMessages(prev => [row, ...prev]);
      }
    } catch (e) { alert(e.message || 'Failed to send'); }
    finally { setSending(false); }
  };

  const renderItem = ({ item }) => {
    const mine = authed ? (item.user_id === sessionUserId) : (item.user_id === 'you');
    const bubbleCommon = { maxWidth: '76%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 };
    const mineStyle = { alignSelf:'flex-end', backgroundColor: '#000', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 6 };
    const otherStyle = { alignSelf:'flex-start', backgroundColor: '#e9e9eb', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 6, borderBottomRightRadius: 18 };
    return (
      <View style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
        <View style={[bubbleCommon, mine ? mineStyle : otherStyle]}>
          <Text style={{ color: mine ? '#fff' : '#000', fontFamily: 'Manrope_400Regular', fontSize: 16 }}>{item.body}</Text>
        </View>
        <Text style={{ marginTop: 4, fontSize: 11, color: '#8e8e93', alignSelf: mine ? 'flex-end' : 'flex-start', fontFamily: 'Manrope_400Regular' }}>{fmtHM(item.created_at)}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        inverted
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToOffset?.({ offset: 0, animated: true })}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 + insets.bottom }}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        <View style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: Math.max(8, insets.bottom), backgroundColor: COLORS.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8 }}>
            <TextInput
              value={input}
              onChangeText={handleChangeText}
              placeholder="iMessage"
              placeholderTextColor="#9e9e9e"
              style={{ flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 16, color: COLORS.text }}
              onFocus={() => setTimeout(() => listRef.current?.scrollToOffset?.({ offset: 0, animated: true }), 50)}
              textAlignVertical="center"
            />
            <Pressable hitSlop={8}><Ionicons name="camera-outline" size={22} color="#7a7a7a" /></Pressable>
          </View>
          <Pressable
            onPress={sendMessage}
            disabled={sending || !input.trim()}
            style={({ pressed }) => ({
              marginLeft: 8, width: 36, height: 36, borderRadius: 18,
              backgroundColor: input.trim() ? COLORS.primary : '#d1d1d6',
              alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1
            })}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function GroupDetailsScreen({ route }) {
  const { groupId } = route.params || {};
  const group = GROUPS.find(g => g.id === groupId) || GROUPS[0];
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 20, color: COLORS.text }}>{group.name}</Text>
        <Text style={{ fontFamily: 'Manrope_400Regular', color: COLORS.subtext, marginTop: 4 }}>
          {group.members.length} member{group.members.length > 1 ? 's' : ''}
        </Text>
      </View>
      <View style={{ height: 1, backgroundColor: COLORS.border }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {group.members.map((uid) => {
          const u = USERS[uid];
          return (
            <View key={uid} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Avatar size={48} name={u?.name || 'Member'} uri={u?.avatarUri} />
              <Text style={{ marginLeft: 12, fontFamily: 'Manrope_600SemiBold', color: COLORS.text }}>{u?.name || 'Member'}</Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- Me / Profile / Edit / PostDetail ---------------- */
function MeScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [myPosts, setMyPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const session = await ensureAuthed();
      const uid = session.user.id;

      const { data: u } = await supabase.from('users').select('id, display_name, avatar_url, bio').eq('id', uid).single();
      setProfile(u || { id: uid, display_name: 'You', avatar_url: null, bio: '' });

      const { data: posts } = await supabase
        .from('posts')
        .select('id, image_url, caption, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      setMyPosts(posts || []);
    } catch (e) { alert(e.message || 'Failed to load profile'); }
    finally { setLoading(false); }
  };

  useEffect(() => { const unsub = navigation.addListener('focus', load); return unsub; }, [navigation]);

  if (loading) {
    return (<SafeAreaView edges={['top']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></SafeAreaView>);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <Avatar size={84} name={profile?.display_name || 'You'} uri={profile?.avatar_url} />
        <View style={{ marginLeft: 14, flex: 1 }}>
          <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 20, color: COLORS.text }} numberOfLines={1}>{profile?.display_name || 'You'}</Text>
          {!!profile?.bio && <Text style={{ fontFamily: 'Manrope_400Regular', color: COLORS.subtext, marginTop: 4 }} numberOfLines={2}>{profile.bio}</Text>}
        </View>
        <Pressable onPress={() => navigation.navigate('Profile', { userId: profile.id, name: profile.display_name })} style={{ paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginRight: 8 }}>
          <Text style={{ fontFamily: 'Manrope_600SemiBold', color: COLORS.text }}>View</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('EditProfile', { userId: profile.id })} style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: COLORS.primary, borderRadius: 10 }}>
          <Text style={{ fontFamily: 'Manrope_700Bold', color: '#fff' }}>Edit</Text>
        </Pressable>
      </View>

      {myPosts.length === 0 ? (
        <View style={{ padding: 20 }}>
          <Text style={{ fontFamily: 'Manrope_400Regular', color: COLORS.subtext }}>
            You haven’t posted yet. Tap the + button on the Feed to create your first post.
          </Text>
        </View>
      ) : (
        <FlatList
          data={myPosts}
          keyExtractor={(x) => x.id}
          numColumns={3}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
              <Image source={{ uri: item.image_url }} style={{ width: W / 3, height: W / 3 }} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ProfileScreen({ route }) {
  const { userId } = route?.params || {};
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const session = await ensureAuthed();
      const uid = userId || session.user.id;

      const { data: u } = await supabase.from('users').select('id, display_name, avatar_url, bio').eq('id', uid).single();
      setProfile(u || { id: uid, display_name: 'User', avatar_url: null, bio: '' });

      const { data: rows } = await supabase
        .from('posts')
        .select('id, image_url, caption, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      setPosts(rows || []);
    } catch (e) { alert(e.message || 'Failed to load profile'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [userId]);

  if (loading) return (<SafeAreaView edges={['top']} style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator /></SafeAreaView>);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 12 }}>
        <Avatar size={96} name={profile?.display_name || 'User'} uri={profile?.avatar_url} />
        <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 20, marginTop: 10, color: COLORS.text }}>{profile?.display_name || 'User'}</Text>
        {!!profile?.bio && <Text style={{ fontFamily: 'Manrope_400Regular', color: COLORS.subtext, marginTop: 6, paddingHorizontal: 24, textAlign: 'center' }}>{profile.bio}</Text>}
      </View>
      <FlatList
        data={posts}
        keyExtractor={(x) => x.id}
        numColumns={3}
        renderItem={({ item }) => (
          <Pressable onPress={() => {}}>
            <Image source={{ uri: item.image_url }} style={{ width: W / 3, height: W / 3 }} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function EditProfileScreen({ navigation }) {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const session = await ensureAuthed();
        const { data: u } = await supabase.from('users').select('display_name, avatar_url, bio').eq('id', session.user.id).maybeSingle();
        setDisplayName(u?.display_name || '');
        setBio(u?.bio || '');
        setAvatarUri(u?.avatar_url || null);
      } catch (e) {
        Alert.alert('Profile unavailable', e?.message || 'Please sign in again.');
      }
    })();
  }, []);

  const onPickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return alert('Permission needed');
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: false, quality: 0.9 });
    if (pick.canceled) return;
    setAvatarUri(pick.assets[0].uri);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const { user } = await ensureAuthed();
      let avatarUrl = avatarUri;
      if (avatarUri && avatarUri.startsWith('file:')) avatarUrl = await uploadToBucket(avatarUri, 'avatars', 'image/jpeg');
      const updates = { display_name: displayName || null, avatar_url: avatarUrl || null };
      const { error } = await supabase.from('users').update(updates).eq('id', user.id);
      if (error) throw error;
      try { await supabase.from('users').update({ bio: bio || null }).eq('id', user.id); } catch {}
      navigation.goBack();
    } catch (e) { alert(e.message || 'Failed to save profile'); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex:1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ alignItems:'center', marginBottom: 16 }}>
          <Pressable onPress={onPickAvatar}><Avatar size={100} name={displayName || 'You'} uri={avatarUri} /></Pressable>
          <Pressable onPress={onPickAvatar} style={{ marginTop: 10 }}><Text style={{ fontFamily:'Manrope_600SemiBold', color: COLORS.primary }}>Change Photo</Text></Pressable>
        </View>

        <Text style={{ fontFamily:'Manrope_700Bold', color: COLORS.text, marginBottom: 6 }}>Name</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Your name" style={{ borderWidth:1, borderColor:COLORS.border, borderRadius:10, padding:12, fontFamily:'Manrope_400Regular', marginBottom: 14 }} />

        <Text style={{ fontFamily:'Manrope_700Bold', color: COLORS.text, marginBottom: 6 }}>Bio</Text>
        <TextInput value={bio} onChangeText={setBio} placeholder="Write a short bio" multiline style={{ minHeight:90, borderWidth:1, borderColor:COLORS.border, borderRadius:10, padding:12, textAlignVertical:'top', fontFamily:'Manrope_400Regular' }} />

        <Pressable onPress={onSave} disabled={saving} style={({pressed})=>({ marginTop:18, backgroundColor: COLORS.primary, paddingVertical:12, borderRadius:12, alignItems:'center', opacity: pressed||saving ? 0.7 : 1 })}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontFamily:'Manrope_700Bold' }}>Save</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- Small UI components ---------------- */


function sortConvos(a, b) {
  if (a.pinned && !b.pinned) return -1;
  if (!a.pinned && b.pinned) return 1;
  return 0;
}

/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  gateRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  title: { marginTop: 22, fontFamily: 'Manrope_700Bold', fontSize: 22, color: COLORS.text },
  subtitle: { marginTop: 6, fontFamily: 'Manrope_400Regular', color: COLORS.subtext },
  portalCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },


  tabBadge: { position: 'absolute', right: -6, top: -4, backgroundColor: '#000', minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Manrope_700Bold' },

  inboxRoot: { flex: 1, backgroundColor: COLORS.bg },
  pinnedWrap: { paddingHorizontal: 12, paddingTop: 10 },
  pinnedGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  pinnedCell: { width: (W - 12 * 2) / 4, alignItems: 'center', marginBottom: 12 },
  pinnedLabel: { marginTop: 6, fontSize: 12, color: COLORS.text, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  listWrap: { paddingHorizontal: 12, paddingTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowCenter: { flex: 1, marginLeft: 10 },
  rowTitle: { fontFamily: 'Manrope_700Bold', color: COLORS.text },
  rowSubtitle: { color: COLORS.subtext, fontFamily: 'Manrope_400Regular' },
  rowRight: { alignItems: 'flex-end' },
  rowTime: { color: COLORS.subtext, fontSize: 12, fontFamily: 'Manrope_400Regular' },


});
