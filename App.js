import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useMemo, useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, Pressable, Dimensions, Image, FlatList,
  TextInput, ActivityIndicator, ScrollView
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';
import * as Contacts from 'expo-contacts';
import * as Localization from 'expo-localization';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { createClient } from '@supabase/supabase-js';

// ---- Supabase (your values) ----
const SUPABASE_URL = 'https://bdcoliwfhvgeabhmqydg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkY29saXdmaHZnZWFiaG1xeWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTA1NjEsImV4cCI6MjA3MzY4NjU2MX0.un-AxI-X5rjubn03BQULQr_f2UM4BAJOH2DaX78uOao';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- Theme ----
const COLORS = {
  bg: '#ffffff',
  text: '#111111',
  subtext: '#6b6b6b',
  primary: '#000000',
  border: '#e6e6e6',
  divider: '#eeeeee',
};

const { width: W, height: H } = Dimensions.get('window');
const IS_SMALL = W < 360 || H < 720;

/* ---------------- Demo placeholder data ---------------- */
const USERS = {
  u1: { id: 'u1', name: 'You', avatarUri: 'https://i.pravatar.cc/150?img=1' },
  u2: { id: 'u2', name: 'Alex Johnson', avatarUri: 'https://i.pravatar.cc/150?img=5' },
  u3: { id: 'u3', name: 'Sam Lee', avatarUri: 'https://i.pravatar.cc/150?img=15' },
  u4: { id: 'u4', name: 'Maya Patel', avatarUri: 'https://i.pravatar.cc/150?img=22' },
};
const GROUPS = [
  { id: '1', name: 'Best Friends', members: ['u1', 'u2', 'u3'], avatarUri: null, last: 'See you at 7? I can drive.', time: '2m', unread: 3, pinned: true },
  { id: '2', name: 'Family',       members: ['u1', 'u4'],       avatarUri: null, last: 'Mom sent a photo 📸',       time: '12m', unread: 0, pinned: true },
  { id: '3', name: 'Basketball Crew', members: ['u1','u2'],   avatarUri: null, last: 'Court is open this wknd',     time: '1h', unread: 1, pinned: false },
  { id: '4', name: 'College',      members: ['u1','u3','u4'],  avatarUri: USERS.u2.avatarUri, last: 'Assignment due Mon', time: '3h', unread: 0, pinned: false },
  { id: '5', name: 'Gaming',       members: ['u1','u2'],       avatarUri: USERS.u3.avatarUri, last: 'Queue later? 🎮', time: 'Yesterday', unread: 0, pinned: false },
];

/* ---------------- Navigation setup ---------------- */
const RootStack = createNativeStackNavigator();
const AuthStackNav = createNativeStackNavigator();
const CirclesStackNav = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

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
      <CirclesStackNav.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({ title: route.params?.name || 'Chat' })}
      />
      <CirclesStackNav.Screen name="GroupDetails" component={GroupDetailsScreen} options={{ title: 'Details' }} />
      <CirclesStackNav.Screen
        name="Profile"
        component={ProfileScreen}
        options={({ route }) => ({ title: route.params?.name || 'Profile' })}
      />
    </CirclesStackNav.Navigator>
  );
}

function AppTabs() {
  const insets = useSafeAreaInsets();
  const [reqCount, setReqCount] = useState(0);

  // Load pending request count & subscribe to changes
  useEffect(() => {
    let mounted = true;
    const loadCount = async () => {
      const { data } = await supabase.rpc('incoming_requests');
      if (mounted) setReqCount((data || []).length);
    };
    loadCount();

    const ch = supabase
      .channel('connreqs_tabbadge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connection_requests' }, () => loadCount())
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  return (
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
          // Badge overlay for Mutuals
          return (
            <View style={{ width: size, height: size }}>
              <Ionicons name={name} size={size} color={color} />
              {route.name === 'Mutuals' && reqCount > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{reqCount > 99 ? '99+' : String(reqCount)}</Text>
                </View>
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
      <Tabs.Screen name="Me" component={ProfileScreen} initialParams={{ userId: 'u1', name: 'You' }} />
    </Tabs.Navigator>
  );
}

/* ---------- Auth stack: Phone → OTP → Contacts intro → Picker → Sync ---------- */
function AuthStack() {
  return (
    <AuthStackNav.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerTitle: '',
        headerTintColor: COLORS.text,
        contentStyle: { backgroundColor: COLORS.bg },
      }}
    >
      {/* First screen has no back arrow */}
      <AuthStackNav.Screen name="AuthPhone" component={AuthPhoneScreen} options={{ headerShown: false }} />
      {/* These will show a back arrow automatically */}
      <AuthStackNav.Screen name="AuthOtp" component={AuthOtpScreen} />
      <AuthStackNav.Screen name="ContactsIntro" component={ContactsIntroScreen} />
      <AuthStackNav.Screen name="ContactsPicker" component={ContactsPickerScreen} />
      <AuthStackNav.Screen name="Syncing" component={SyncingScreen} options={{ headerShown: false }} />
    </AuthStackNav.Navigator>
  );
}

/* ---------------- Root App ---------------- */
export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Gate" component={GateScreen} />
          <RootStack.Screen name="Auth" component={AuthStack} />
          <RootStack.Screen name="MainTabs" component={AppTabs} />
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

/* ---------------- Gate (with monochrome ripple waves) ---------------- */
function GateScreen({ navigation }) {
  const { width: Ww, height: Hh } = Dimensions.get('window');
  const S = Math.min(Ww, Hh);
  const size = Math.round(S * (IS_SMALL ? 0.26 : 0.3));
  const portalScaleTarget = useMemo(() => {
    const diag = Math.hypot(Ww, Hh);
    return (diag / size) * 1.25;
  }, [size]);
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

/* ---------------- Auth: Phone ---------------- */
function AuthPhoneScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const region = Localization?.region || 'US';

  const onSendCode = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const parsed = parsePhoneNumberFromString(phone, region);
      const e164 = parsed?.isValid() ? parsed.number : phone.trim();
      const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
      if (error) throw error;
      navigation.replace('AuthOtp', { phone: e164 });
    } catch (e) {
      alert(e.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.authRoot} edges={['top']}>
      <Text style={styles.authTitle}>Verify your phone</Text>
      <Text style={styles.authCaption}>We’ll text you a one-time code.</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 555 123 4567"
        keyboardType="phone-pad"
        style={styles.input}
      />
      <Pressable style={styles.primaryBtn} onPress={onSendCode} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send Code</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

/* ---------------- Auth: OTP ---------------- */
function AuthOtpScreen({ route, navigation }) {
  const { phone } = route.params || {};
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const onVerify = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: code.trim(),
        type: 'sms',
      });
      if (error) throw error;

      await supabase.rpc('ensure_user', { phone });
      navigation.replace('ContactsIntro');
    } catch (e) {
      alert(e.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.authRoot} edges={['top']}>
      <Text style={styles.authTitle}>Enter the code</Text>
      <Text style={styles.authCaption}>We sent an SMS to {phone}</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
        style={styles.input}
      />
      <Pressable style={styles.primaryBtn} onPress={onVerify} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify</Text>}
      </Pressable>
      <Pressable style={{ marginTop: 12 }} onPress={() => navigation.replace('AuthPhone')}>
        <Text style={styles.linkText}>Use a different number</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/* ---------------- Contacts Intro ---------------- */
function ContactsIntroScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.authRoot} edges={['top']}>
      <Text style={styles.authTitle}>Find your mutuals</Text>
      <Text style={styles.authCaption}>
        We match only with people who also have your number. Exclude anyone before syncing.
      </Text>
      <View style={{ height: 16 }} />
      <Pressable style={styles.primaryBtn} onPress={() => navigation.replace('ContactsPicker')}>
        <Text style={styles.primaryBtnText}>Choose Contacts</Text>
      </Pressable>
      <Pressable style={{ marginTop: 12 }} onPress={() => navigation.replace('MainTabs')}>
        <Text style={styles.linkText}>Skip for now</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/* ---------------- Contacts Picker ---------------- */
function ContactsPickerScreen({ navigation }) {
  const [items, setItems] = useState([]);
  thead: null
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const region = Localization?.region || 'US';

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('Contacts permission denied');
        navigation.replace('MainTabs');
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 2000,
      });
      const mapped = (data || [])
        .filter(c => c.phoneNumbers && c.phoneNumbers.length)
        .map(c => ({
          id: c.id,
          name: c.name || 'Unknown',
          numbers: c.phoneNumbers.map(p => p.number).filter(Boolean),
          selected: true,
        }));
      setItems(mapped);
      setLoading(false);
    })();
  }, [navigation]);

  const toggle = (id) => setItems(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i));
  const selectAll = (val) => setItems(prev => prev.map(i => ({ ...i, selected: val })));

  const normalizeToE164 = (raw) => {
    try {
      const parsed = parsePhoneNumberFromString(raw, region);
      if (parsed?.isValid()) return parsed.number;
    } catch {}
    const digits = (raw || '').replace(/\D+/g, '');
    if (!digits) return null;
    if (digits.startsWith('1') && digits.length === 11) return '+' + digits;
    if (digits.length === 10) return '+1' + digits;
    return '+' + digits;
  };

  const onContinue = async () => {
    setSubmitting(true);
    try {
      const e164 = new Set();
      items.forEach(i => {
        if (!i.selected) return;
        i.numbers.forEach(n => {
          const v = normalizeToE164(n);
          if (v) e164.add(v);
        });
      });
      const arr = Array.from(e164);

      const { data, error } = await supabase.rpc('upload_contacts', { phones: arr });
      if (error) throw error;

      navigation.replace('Syncing', { summary: data || { uploaded: arr.length } });
    } catch (e) {
      alert(e.message || 'Failed to sync contacts');
      navigation.replace('MainTabs');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.authRoot} edges={['top']}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, fontFamily: 'Manrope_400Regular', color: COLORS.subtext }}>Loading contacts…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.authRoot} edges={['top']}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={styles.authTitle}>Choose contacts</Text>
        <Pressable onPress={() => selectAll(true)}><Text style={styles.linkText}>Select all</Text></Pressable>
        <Pressable onPress={() => selectAll(false)}><Text style={styles.linkText}>Deselect all</Text></Pressable>
      </View>
      <View style={{ flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, borderRadius: 12, overflow: 'hidden' }}>
        <ScrollView>
          {items.map(item => (
            <Pressable
              key={item.id}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => [styles.contactRow, { backgroundColor: pressed ? '#f8f8f8' : COLORS.bg }]}
            >
              <View style={[styles.checkbox, item.selected && styles.checkboxOn]}>
                {item.selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.contactNumbers} numberOfLines={1}>{item.numbers[0]}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <Pressable style={[styles.primaryBtn, { marginTop: 12 }]} onPress={onContinue} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue</Text>}
      </Pressable>
      <Pressable style={{ marginTop: 10 }} onPress={() => navigation.replace('MainTabs')}>
        <Text style={styles.linkText}>Skip for now</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/* ---------------- Syncing summary ---------------- */
function SyncingScreen({ route, navigation }) {
  const summary = route.params?.summary || {};
  useEffect(() => {
    const t = setTimeout(() => navigation.replace('MainTabs'), 900);
    return () => clearTimeout(t);
  }, [navigation]);
  return (
    <SafeAreaView style={styles.authRoot} edges={['top']}>
      <Text style={styles.authTitle}>All set</Text>
      <Text style={styles.authCaption}>
        Uploaded: {summary.uploaded ?? '—'} • New mutuals: {summary.mutuals ?? '—'}
      </Text>
      <ActivityIndicator style={{ marginTop: 14 }} />
    </SafeAreaView>
  );
}

/* ---------------- Mutuals (new) ---------------- */
function MutualsScreen() {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [sending, setSending] = useState({});
  const [responding, setResponding] = useState({});
  const [tab, setTab] = useState('forYou'); // 'forYou' | 'requests'

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: cand, error: e1 }, { data: reqs, error: e2 }] = await Promise.all([
        supabase.rpc('mutual_candidates'),
        supabase.rpc('incoming_requests'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setCandidates(cand || []);
      setIncoming(reqs || []);
    } catch (err) {
      alert(err.message || 'Failed to load mutuals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Realtime refresh when requests change
  useEffect(() => {
    const ch = supabase
      .channel('connreqs_mutuals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connection_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const sendRequest = async (userId) => {
    setSending(s => ({ ...s, [userId]: true }));
    try {
      const { error } = await supabase.rpc('send_connection_request', { to_user_id: userId });
      if (error) throw error;
      setCandidates(prev => prev.filter(u => u.id !== userId));
    } catch (e) {
      alert(e.message || 'Failed to send request');
    } finally {
      setSending(s => ({ ...s, [userId]: false }));
    }
  };

  const respond = async (reqId, action) => {
    setResponding(s => ({ ...s, [reqId]: true }));
    try {
      const { error } = await supabase.rpc('respond_connection_request', { req_id: reqId, action });
      if (error) throw error;
      setIncoming(prev => prev.filter(r => r.id !== reqId));
    } catch (e) {
      alert(e.message || 'Failed to update request');
    } finally {
      setResponding(s => ({ ...s, [reqId]: false }));
    }
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
      {/* Segment control */}
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
            <Text style={{ textAlign:'center', color:COLORS.subtext, fontFamily:'Manrope_400Regular' }}>
              No requests right now.
            </Text>
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

/* ---------------- Inbox / Chat / Details / Feed / Profile ---------------- */
function InboxScreen({ navigation }) {
  const [convos, setConvos] = useState(GROUPS);
  const togglePin = async (id) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConvos((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)).sort(sortConvos));
  };
  const openConversation = async (c) => {
    await Haptics.selectionAsync();
    navigation.navigate('Chat', { groupId: c.id, name: c.name });
  };
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
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('GroupDetails', { groupId })} hitSlop={10}>
          <Ionicons name="ellipsis-horizontal-circle" size={22} color={COLORS.text} />
        </Pressable>
      ),
    });
  }, [navigation, groupId]);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 16, color: COLORS.subtext }}>
          Chat with {group.name} (messages to be implemented)
        </Text>
      </View>
      <View style={styles.composer}>
        <Text style={styles.composerText}>Message composer…</Text>
        <Pressable style={styles.sendButton}><Ionicons name="send" size={18} color="#fff" /></Pressable>
      </View>
    </View>
  );
}

function GroupDetailsScreen({ route, navigation }) {
  const { groupId } = route.params || {};
  const group = GROUPS.find((g) => g.id === groupId) || GROUPS[0];
  const members = group.members.map((id) => USERS[id]);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ padding: 16, alignItems: 'center' }}>
        <Avatar size={96} name={group.name} uri={group.avatarUri} />
        <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 20, marginTop: 10, color: COLORS.text }}>{group.name}</Text>
        <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 13, color: COLORS.subtext, marginTop: 2 }}>{members.length} members</Text>
      </View>
      <View style={{ paddingHorizontal: 12 }}>
        <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 16, marginBottom: 8, color: COLORS.text }}>Members</Text>
        {members.map((m) => (
          <Pressable key={m.id} onPress={() => navigation.navigate('Profile', { userId: m.id, name: m.name })} style={({ pressed }) => [styles.memberRow, { opacity: pressed ? 0.9 : 1 }]}>
            <Avatar size={44} name={m.name} uri={m.avatarUri} />
            <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
            <Ionicons name="chevron-forward" size={18} color="#bbb" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function FeedScreen() {
  const posts = new Array(12).fill(0).map((_, i) => ({ id: `p${i}`, uri: `https://picsum.photos/seed/${i + 10}/400/400` }));
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList data={posts} keyExtractor={(x) => x.id} numColumns={3} renderItem={({ item }) => (
        <Image source={{ uri: item.uri }} style={{ width: W / 3, height: W / 3 }} />
      )} />
    </SafeAreaView>
  );
}

function ProfileScreen({ route }) {
  const { userId = 'u1' } = route?.params || {};
  const user = USERS[userId] || USERS.u1;
  const tiles = new Array(9).fill(0).map((_, i) => ({ id: `${userId}-ph-${i}`, uri: `https://picsum.photos/seed/${userId}-${i}/400/400` }));
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={styles.profileHeader}>
        <Avatar size={84} name={user.name} uri={user.avatarUri} />
        <Text style={styles.profileName}>{user.name}</Text>
        <View style={styles.profileStats}>
          <Stat label="Posts" value="24" />
          <Stat label="Circles" value="5" />
          <Stat label="Friends" value="42" />
        </View>
      </View>
      <FlatList data={tiles} keyExtractor={(x) => x.id} numColumns={3} renderItem={({ item }) => (
        <Image source={{ uri: item.uri }} style={{ width: W / 3, height: W / 3 }} />
      )} />
    </SafeAreaView>
  );
}

/* ---------------- UI atoms & helpers ---------------- */

function Stat({ label, value }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text }}>{value}</Text>
      <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: COLORS.subtext }}>{label}</Text>
    </View>
  );
}

// Minimal monochrome avatar with opaque outline and ripple waves
function Avatar({ size, name, uri, ripple = false }) {
  const R = size / 2;
  const ring = Math.max(2, Math.round(size * 0.06));
  const initials = getInitials(name);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {ripple ? <Ripples size={size} color={COLORS.primary} /> : null}
      <View
        style={{
          width: size, height: size, borderRadius: R,
          borderWidth: ring, borderColor: COLORS.primary,
          backgroundColor: 'rgba(0,0,0,0.04)', overflow: 'hidden',
          alignItems: 'center', justifyContent: 'center'
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: Math.round(size * 0.36), color: COLORS.text }}>{initials}</Text>
        )}
      </View>
    </View>
  );
}

// Gate circle with ripples
function MonoRingWithRipples({ size }) {
  const R = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ripples size={size} color={COLORS.primary} />
      <View style={{ width: size, height: size, borderRadius: R, borderWidth: Math.max(3, Math.round(size * 0.06)), borderColor: COLORS.primary, backgroundColor: 'rgba(0,0,0,0.02)' }} />
    </View>
  );
}

// Concentric waves that expand and fade
function Ripples({ size, color }) {
  const baseStyle = {
    position: 'absolute',
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 2,
    borderColor: color,
  };
  return (
    <>
      <MotiView
        style={baseStyle}
        from={{ opacity: 0.18, scale: 1 }}
        animate={{ opacity: 0, scale: 1.6 }}
        transition={{ type: 'timing', duration: 2200, loop: true }}
        pointerEvents="none"
      />
      <MotiView
        style={baseStyle}
        from={{ opacity: 0.14, scale: 1 }}
        animate={{ opacity: 0, scale: 1.9 }}
        transition={{ type: 'timing', duration: 2600, delay: 350, loop: true }}
        pointerEvents="none"
      />
      <MotiView
        style={baseStyle}
        from={{ opacity: 0.1, scale: 1 }}
        animate={{ opacity: 0, scale: 2.2 }}
        transition={{ type: 'timing', duration: 3000, delay: 700, loop: true }}
        pointerEvents="none"
      />
    </>
  );
}

function UnreadBadge({ count }) {
  const text = count > 99 ? '99+' : String(count);
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

function sortConvos(a, b) {
  if (a.pinned && !b.pinned) return -1;
  if (!a.pinned && b.pinned) return 1;
  return 0;
}
function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || '';
  return (first + second).toUpperCase();
}

/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  gateRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f7f7' },
  title: { fontFamily: 'Manrope_700Bold', fontSize: IS_SMALL ? 20 : 24, color: COLORS.text, textAlign: 'center', marginTop: 14, marginBottom: 4, paddingHorizontal: 12 },
  subtitle: { fontFamily: 'Manrope_400Regular', fontSize: IS_SMALL ? 14 : 16, color: COLORS.subtext, textAlign: 'center', paddingHorizontal: 12 },
  portalCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  authRoot: { flex: 1, backgroundColor: COLORS.bg, padding: 16 },
  authTitle: { fontFamily: 'Manrope_700Bold', fontSize: 22, color: COLORS.text, marginBottom: 6 },
  authCaption: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: COLORS.subtext },
  input: { marginTop: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontFamily: 'Manrope_400Regular', fontSize: 16, color: COLORS.text },
  primaryBtn: { marginTop: 16, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 16 },
  linkText: { color: COLORS.text, fontFamily: 'Manrope_600SemiBold' },

  contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.divider },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#c9c9c9', alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: '#fff' },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  contactName: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: COLORS.text },
  contactNumbers: { marginLeft: 8, fontFamily: 'Manrope_400Regular', fontSize: 12, color: COLORS.subtext, maxWidth: '42%' },

  inboxRoot: { flex: 1, backgroundColor: COLORS.bg },
  pinnedWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, backgroundColor: COLORS.bg },
  pinnedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pinnedCell: { width: Math.floor(W / 3) - 16, alignItems: 'center' },
  pinnedLabel: { marginTop: 6, textAlign: 'center', fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: COLORS.text },

  listWrap: { flex: 1, backgroundColor: COLORS.bg },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.divider },
  rowCenter: { flex: 1, marginLeft: 12, marginRight: 8 },
  rowTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text },
  rowSubtitle: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: COLORS.subtext, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', minWidth: 56 },
  rowTime: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#888', marginBottom: 6 },

  composer: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, backgroundColor: COLORS.bg },
  composerText: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 14, color: COLORS.subtext },
  sendButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },

  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.divider },
  memberName: { flex: 1, marginLeft: 12, fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: COLORS.text },
  profileHeader: { alignItems: 'center', paddingTop: 20, paddingBottom: 16, backgroundColor: COLORS.bg },
  profileName: { fontFamily: 'Manrope_700Bold', fontSize: 20, marginTop: 10, color: COLORS.text },
  profileStats: { flexDirection: 'row', width: '90%', marginTop: 12, gap: 12 },

  badge: { minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#fff' },

  tabBadge: {
    position: 'absolute', top: -2, right: -10, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3
  },
  tabBadgeText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 10 },
});
