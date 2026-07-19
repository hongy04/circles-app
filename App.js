import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView,
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View
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
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { COLORS } from './src/theme/colors';
import { DEV_BYPASS_CODE, IS_DEVELOPMENT } from './src/config/env';
import { supabase } from './src/lib/supabase';
import { ensureAuthed, ensureDevSession } from './src/services/authService';
import { uploadToBucket } from './src/services/uploadService';

/* ---------------- Layout & helpers ---------------- */
const { width: W, height: H } = Dimensions.get('window');
const IS_SMALL = W < 360 || H < 720;

function timeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
function getInitials(name = '') {
  return name.split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase();
}
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
const AuthStackNav = createNativeStackNavigator();
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
          <RootStack.Screen name="Auth" component={AuthStack} />
          <RootStack.Screen name="MainTabs" component={AppTabs} />
          <RootStack.Screen name="CreatePost" component={CreatePostScreen} />
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

/* ---------------- Auth stack ---------------- */
function AuthStack() {
  return (
    <AuthStackNav.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg } }}>
      <AuthStackNav.Screen name="AuthPhone" component={AuthPhoneScreen} />
      <AuthStackNav.Screen name="AuthOtp" component={AuthOtpScreen} />
      <AuthStackNav.Screen name="ContactsIntro" component={ContactsIntroScreen} />
      <AuthStackNav.Screen name="ContactsPicker" component={ContactsPickerScreen} />
      <AuthStackNav.Screen name="Syncing" component={SyncingScreen} />
    </AuthStackNav.Navigator>
  );
}

function AuthPhoneScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const region = Localization?.region || 'US';

  const onSendCode = async () => {
    if (!phone.trim()) {
      Alert.alert('Phone required', 'Enter your phone number.');
      return;
    }

    setLoading(true);

    try {
      const parsed = parsePhoneNumberFromString(phone, region);
      const e164 = parsed?.isValid() ? parsed.number : phone.trim();

      /*
       * Development mode:
       * Do not require Twilio/SMS just to reach the test OTP screen.
       * The 000000 code will create the authenticated dev session there.
       */
      if (IS_DEVELOPMENT) {
        navigation.replace('AuthOtp', { phone: e164 });
        return;
      }

      /*
       * Production mode:
       * A configured Supabase phone provider is required.
       */
      const { error } = await supabase.auth.signInWithOtp({
        phone: e164,
      });

      if (error) throw error;

      navigation.replace('AuthOtp', { phone: e164 });
    } catch (e) {
      Alert.alert(
        'Could not send code',
        e?.message || 'Failed to send the verification code.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.authRoot} edges={['top']}>
      <Text style={styles.authTitle}>Verify your phone</Text>

      <Text style={styles.authCaption}>
        We’ll text you a one-time code.
      </Text>

      {IS_DEVELOPMENT ? (
        <Text style={[styles.authCaption, { marginTop: 6 }]}>
          Development mode: no text will be sent. Enter 000000 on the next
          screen.
        </Text>
      ) : null}

      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 555 123 4567"
        keyboardType="phone-pad"
        style={styles.input}
      />

      <Pressable
        style={styles.primaryBtn}
        onPress={onSendCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {IS_DEVELOPMENT ? 'Continue' : 'Send Code'}
          </Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

function AuthOtpScreen({ route, navigation }) {
  const { phone } = route.params || {};

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const onVerify = async () => {
    const token = (code || '').trim();

    if (!token) {
      Alert.alert('Code required', 'Enter the six-digit verification code.');
      return;
    }

    setLoading(true);

    try {
      /*
       * Development bypass:
       * Establish a real Supabase session before entering the app.
       */
      if (IS_DEVELOPMENT && token === DEV_BYPASS_CODE) {
        const session = await ensureDevSession(phone);

        if (!session?.user) {
          throw new Error(
            'The development account could not sign in. Check that dev@circles.local exists and Email auth is enabled in Supabase.'
          );
        }

        navigation.replace('ContactsIntro');
        return;
      }

      /*
       * Real SMS verification.
       */
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (error) throw error;

      if (!data?.session?.user) {
        throw new Error('Verification succeeded, but no session was created.');
      }

      const { error: ensureError } = await supabase.rpc('ensure_user', {
        phone,
      });

      if (ensureError) throw ensureError;

      navigation.replace('ContactsIntro');
    } catch (e) {
      Alert.alert(
        'Verification failed',
        e?.message || 'Invalid or expired code.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.authRoot} edges={['top']}>
      <Text style={styles.authTitle}>Enter the code</Text>

      <Text style={styles.authCaption}>
        {IS_DEVELOPMENT
          ? `Development login for ${phone || 'this device'}`
          : `We sent an SMS to ${phone}`}
      </Text>

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
        style={styles.input}
      />

      <Pressable
        style={styles.primaryBtn}
        onPress={onVerify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Verify</Text>
        )}
      </Pressable>

      <Pressable
        style={{ marginTop: 12 }}
        onPress={() => navigation.replace('AuthPhone')}
      >
        <Text style={styles.linkText}>Use a different number</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/* ---------------- Contacts sync ---------------- */
function ContactsIntroScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.authRoot} edges={['top']}>
      <Text style={styles.authTitle}>Find your mutuals</Text>
      <Text style={styles.authCaption}>We match only with people who also have your number. Exclude anyone before syncing.</Text>
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

function ContactsPickerScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const region = Localization?.region || 'US';

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') { alert('Contacts permission denied'); navigation.replace('MainTabs'); return; }
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers], pageSize: 2000 });
      const mapped = (data || [])
        .filter(c => c.phoneNumbers && c.phoneNumbers.length)
        .map(c => ({ id: c.id, name: c.name || 'Unknown', numbers: c.phoneNumbers.map(p => p.number).filter(Boolean), selected: true }));
      setItems(mapped); setLoading(false);
    })();
  }, [navigation]);

  const allSelected = items.length > 0 && items.every(i => i.selected);
  const toggleAll = () => setItems(prev => prev.map(i => ({ ...i, selected: !allSelected })));
  const toggle = (id) => setItems(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i));

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
      await ensureAuthed(); // ensure session for RPC that writes
      const e164 = new Set();
      items.forEach(i => { if (i.selected) i.numbers.forEach(n => { const v = normalizeToE164(n); if (v) e164.add(v); }); });
      const arr = Array.from(e164);
      const { data, error } = await supabase.rpc('upload_contacts', { phones: arr });
      if (error) throw error;
      navigation.replace('Syncing', { summary: data || { uploaded: arr.length } });
    } catch (e) {
      alert(e.message || 'Failed to sync contacts');
      navigation.replace('MainTabs');
    } finally { setSubmitting(false); }
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
    <SafeAreaView style={[styles.authRoot, { paddingHorizontal: 16 }]} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={styles.authTitle}>Choose contacts</Text>
        <Pressable onPress={toggleAll} hitSlop={8} style={({pressed}) => ({
          flexDirection:'row', alignItems:'center',
          paddingHorizontal: 10, paddingVertical: 6,
          borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
          backgroundColor: pressed ? '#f6f6f6' : '#fff'
        })}>
          <View style={[styles.checkbox, allSelected && styles.checkboxOn, { marginRight: 8 }]}>
            {allSelected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </View>
          <Text style={{ fontFamily:'Manrope_600SemiBold', color: COLORS.text }}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, borderRadius: 12, overflow: 'hidden' }}>
        <ScrollView>
          {items.map(item => (
            <Pressable
              key={item.id}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => [styles.contactRow, { backgroundColor: pressed ? '#f8f8f8' : COLORS.bg, paddingHorizontal: 12 }]}
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

function SyncingScreen({ route, navigation }) {
  const summary = route.params?.summary || {};
  useEffect(() => { const t = setTimeout(() => navigation.replace('MainTabs'), 900); return () => clearTimeout(t); }, [navigation]);
  return (
    <SafeAreaView style={styles.authRoot} edges={['top']}>
      <Text style={styles.authTitle}>All set</Text>
      <Text style={styles.authCaption}>Uploaded: {summary.uploaded ?? '—'} • New mutuals: {summary.mutuals ?? '—'}</Text>
      <ActivityIndicator style={{ marginTop: 14 }} />
    </SafeAreaView>
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

/* ---------------- Feed + Stories + Comments ---------------- */
function FeedScreen({ navigation }) {
  const [posts, setPosts] = useState([]);
  const [authed, setAuthed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [openPost, setOpenPost] = useState(null);
  const [activeComments, setActiveComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [stories, setStories] = useState([]);
  const [storyOpen, setStoryOpen] = useState(null);
  const [storyIndex, setStoryIndex] = useState(0);

  const loadStories = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setStories([]); return; }
    const { data } = await supabase.rpc('get_active_stories');
    const map = new Map();
    (data || []).forEach(r => {
      const k = r.user_id;
      if (!map.has(k)) map.set(k, { userId:k, userName:r.display_name||'Someone', avatar:r.avatar_url||null, items:[] });
      map.get(k).items.push({ id:r.id, url:r.url, media_type:r.media_type, created_at:r.created_at });
    });
    setStories(Array.from(map.values()));
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAuthed(!!session);
      if (session) {
        await loadInitial();
        await loadStories();
        const ch = supabase
          .channel('feed_rt')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => loadInitial())
          .subscribe();
        return () => { supabase.removeChannel(ch); };
      } else {
        setPosts([]);
      }
    })();
  }, []);

  const mapRow = (r) => ({
    id: r.id,
    user: { name: r.author_name || 'Unknown', avatarUri: r.author_avatar || null },
    uri: r.image_url,
    liked: !!r.liked_by_me,
    likes: r.likes_count || 0,
    caption: r.caption || '',
    time: timeAgo(r.created_at),
    created_at: r.created_at,
  });

  const loadInitial = async () => {
    try {
      const { data, error } = await supabase.rpc('get_feed', { limit_count: 10, before: new Date().toISOString() });
      if (error) throw error;
      const mapped = (data || []).map(mapRow);
      setPosts(mapped);
      setCursor(mapped.length ? mapped[mapped.length - 1].created_at : null);
    } catch (e) { alert(e.message || 'Failed to load feed'); }
  };

  const loadMore = async () => {
    if (!authed || loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const { data, error } = await supabase.rpc('get_feed', { limit_count: 10, before: cursor });
      if (error) throw error;
      const mapped = (data || []).map(mapRow);
      setPosts(prev => [...prev, ...mapped]);
      if (mapped.length) setCursor(mapped[mapped.length - 1].created_at);
      else setCursor(null);
    } catch {}
    finally { setLoadingMore(false); }
  };

  const toggleLike = async (postId, localOnly = false) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, liked: !p.liked, likes: Math.max(0, p.likes + (p.liked ? -1 : 1)) } : p));
    if (localOnly) return;
    try {
      await ensureAuthed();
      const { error } = await supabase.rpc('toggle_like', { p_post_id: postId });
      if (error) Alert.alert('Error', error.message);
    } catch (e) {}
  };

  const openComments = async (postId) => {
    setOpenPost(postId); setActiveComments([]);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: rows } = await supabase
      .from('post_comments')
      .select('id, body, created_at, user_id, post_id')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    const ids = Array.from(new Set((rows || []).map(r => r.user_id)));
    let usersMap = new Map();
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, display_name, avatar_url').in('id', ids);
      usersMap = new Map((us || []).map(u => [u.id, u]));
    }
    setActiveComments((rows || []).map(r => ({
      id: r.id,
      userName: usersMap.get(r.user_id)?.display_name || 'Someone',
      avatarUri: usersMap.get(r.user_id)?.avatar_url || null,
      text: r.body,
    })));
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    const text = commentText.trim();
    setCommentText('');
    setActiveComments(prev => [...prev, { id: randomId(), userName: 'You', avatarUri: null, text }]);
    try {
      await ensureAuthed();
      if (openPost) {
        const { error } = await supabase.rpc('add_comment', { p_post_id: openPost, p_body: text });
        if (error) Alert.alert('Error', error.message);
      }
    } catch (e) {}
  };

  const renderItem = ({ item }) => (
    <PostCard
      post={item}
      onToggleLike={() => toggleLike(item.id)}
      onDoubleLike={() => toggleLike(item.id, true)}
      onOpenComments={() => openComments(item.id)}
    />
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList
        data={posts}
        keyExtractor={(x) => x.id}
        renderItem={renderItem}
        onEndReachedThreshold={0.2}
        onEndReached={loadMore}
        ListHeaderComponent={(
          <StoriesRail
            stories={stories}
            onAddYourStory={async () => {
              try {
                await ensureAuthed();
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') return alert('Permission needed');
                const pick = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.All,
                  allowsMultipleSelection: false,
                  quality: 0.9,
                  videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
                });
                if (pick.canceled) return;
                const a = pick.assets[0];
                const url = await uploadToBucket(a.uri, 'stories', a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'));
                const { user } = await ensureAuthed();
                await supabase.from('stories').insert({
                  user_id: user.id,
                  url,
                  media_type: (a.type === 'video' ? 'video' : 'image')
                });
                loadStories();
              } catch (e) { alert(e.message || 'Failed to add story'); }
            }}
            onOpen={(userIdx) => { setStoryOpen(userIdx); setStoryIndex(0); }}
          />
        )}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {/* Comments Modal */}
      <Modal visible={!!openPost} animationType="slide" onRequestClose={() => setOpenPost(null)}>
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <View style={{ padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
            <Pressable onPress={() => setOpenPost(null)} hitSlop={10}><Ionicons name="chevron-back" size={22} color={COLORS.text} /></Pressable>
            <Text style={{ marginLeft: 8, fontFamily: 'Manrope_700Bold', fontSize: 16, color: COLORS.text }}>Comments</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 80 }}>
            {activeComments.length ? activeComments.map(c => (
              <View key={c.id} style={{ flexDirection: 'row', marginBottom: 12 }}>
                <View style={{ marginRight: 10 }}><Avatar size={34} name={c.userName} uri={c.avatarUri} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Manrope_700Bold', color: COLORS.text }}>{c.userName}</Text>
                  <Text style={{ fontFamily: 'Manrope_400Regular', color: COLORS.text }}>{c.text}</Text>
                </View>
              </View>
            )) : (
              <Text style={{ fontFamily: 'Manrope_400Regular', color: COLORS.subtext, textAlign: 'center', marginTop: 24 }}>
                No comments yet. Be the first to say something!
              </Text>
            )}
          </ScrollView>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border }}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment…"
                style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontFamily: 'Manrope_400Regular' }}
              />
              <Pressable onPress={submitComment} style={{ marginLeft: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontFamily: 'Manrope_700Bold' }}>Post</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Floating create */}
      <Pressable
        onPress={() => navigation.navigate('CreatePost')}
        style={({pressed}) => ({
          position:'absolute', right:16, bottom:24,
          width:56, height:56, borderRadius:28,
          backgroundColor: COLORS.primary, alignItems:'center', justifyContent:'center',
          opacity: pressed?0.85:1, shadowColor:'#000', shadowOpacity:0.2, shadowRadius:6, shadowOffset:{width:0,height:3}, elevation:4
        })}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Story viewer */}
      <Modal visible={storyOpen !== null} animationType="fade" onRequestClose={()=>setStoryOpen(null)}>
        <SafeAreaView edges={['top']} style={{ flex:1, backgroundColor:'#000' }}>
          {storyOpen !== null ? (
            <StoryViewer
              user={stories[storyOpen]}
              index={storyIndex}
              onClose={()=>setStoryOpen(null)}
              onNext={()=>{
                const user = stories[storyOpen];
                if (storyIndex + 1 < user.items.length) setStoryIndex(i=>i+1);
                else if (storyOpen + 1 < stories.length) { setStoryOpen(i=>i+1); setStoryIndex(0); }
                else setStoryOpen(null);
              }}
              onPrev={()=>{
                if (storyIndex > 0) setStoryIndex(i=>i-1);
                else if (storyOpen > 0) { const prevUser = stories[storyOpen-1]; setStoryOpen(i=>i-1); setStoryIndex(prevUser.items.length-1); }
                else setStoryOpen(null);
              }}
            />
          ): null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function StoriesRail({ stories, onAddYourStory, onOpen }) {
  return (
    <View style={{ paddingVertical: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
        <Pressable onPress={onAddYourStory} style={{ alignItems:'center', marginRight: 14 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth:2, borderColor: COLORS.primary, alignItems:'center', justifyContent:'center', backgroundColor:'#f6f6f6' }}>
            <Ionicons name="add" size={28} color={COLORS.primary} />
          </View>
          <Text style={{ fontFamily:'Manrope_600SemiBold', fontSize:12, marginTop:6, color:COLORS.text }}>Your Story</Text>
        </Pressable>
        {stories.map((s, idx) => (
          <Pressable key={s.userId} onPress={() => onOpen(idx)} style={{ alignItems:'center', marginRight: 14 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth:2, borderColor: COLORS.primary, overflow:'hidden' }}>
              {s.avatar ? <Image source={{ uri: s.avatar }} style={{ width:'100%', height:'100%' }} /> :
                <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
                  <Text style={{ fontFamily:'Manrope_700Bold' }}>{getInitials(s.userName)}</Text>
                </View>}
            </View>
            <Text numberOfLines={1} style={{ maxWidth:70, fontFamily:'Manrope_600SemiBold', fontSize:12, marginTop:6, color:COLORS.text }}>
              {s.userName}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function StoryViewer({ user, index, onClose, onNext, onPrev }) {
  const item = user?.items?.[index];
  const isImage = item?.media_type === 'image';
  const [progress, setProgress] = useState(0);
  const progRef = useRef(null);

  useEffect(() => {
    setProgress(0);
    if (isImage) {
      clearInterval(progRef.current);
      const start = Date.now();
      progRef.current = setInterval(() => {
        const t = (Date.now() - start) / 5000;
        if (t >= 1) { clearInterval(progRef.current); onNext(); }
        else setProgress(t);
      }, 50);
    }
    return () => clearInterval(progRef.current);
  }, [item?.id]);

  return (
    <View style={{ flex:1 }}>
      <View style={{ position:'absolute', top:12, left:12, right:12, zIndex:10 }}>
        <View style={{ flexDirection:'row', gap:6, marginBottom:8 }}>
          {user.items.map((_, i) => (
            <View key={i} style={{ flex:1, height:3, backgroundColor:'rgba(255,255,255,0.3)', borderRadius:2, overflow:'hidden' }}>
              <View style={{ width: `${i<index ? 100 : i>index ? 0 : progress*100}%`, height:'100%', backgroundColor:'#fff' }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
          <View style={{ flexDirection:'row', alignItems:'center' }}>
            <View style={{ width:32, height:32, borderRadius:16, overflow:'hidden', borderWidth:1, borderColor:'#fff' }}>
              {user.avatar ? <Image source={{ uri: user.avatar }} style={{ width:'100%', height:'100%' }} /> : null}
            </View>
            <Text style={{ color:'#fff', marginLeft:8, fontFamily:'Manrope_700Bold' }}>{user.userName}</Text>
          </View>
          <Pressable onPress={onClose}><Ionicons name="close" size={26} color="#fff" /></Pressable>
        </View>
      </View>

      <Pressable style={{ flex:1, flexDirection:'row' }}>
        <Pressable style={{ flex:1 }} onPress={onPrev} />
        <View style={{ width: Math.min(800, Dimensions.get('window').width), aspectRatio: 9/16, alignSelf:'center' }}>
          {isImage ? (
            <Image source={{ uri: item.url }} style={{ width:'100%', height:'100%' }} resizeMode="cover" />
          ) : (
            <Video
              source={{ uri: item.url }}
              style={{ width:'100%', height:'100%' }}
              resizeMode="cover"
              shouldPlay
              onPlaybackStatusUpdate={(st) => {
                if (!st || !st.isLoaded) return;
                if (st.didJustFinish) onNext();
                if (st.durationMillis) setProgress(Math.min(1, (st.positionMillis || 0) / st.durationMillis));
              }}
            />
          )}
        </View>
        <Pressable style={{ flex:1 }} onPress={onNext} />
      </Pressable>
    </View>
  );
}

function PostCard({ post, onToggleLike, onDoubleLike, onOpenComments }) {
  const [showBigHeart, setShowBigHeart] = useState(false);
  const lastTapRef = useRef(0);

  const onImagePress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      setShowBigHeart(true);
      if (!post.liked) onDoubleLike?.();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => setShowBigHeart(false), 650);
    }
    lastTapRef.current = now;
  };

  return (
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.divider }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        <Avatar size={36} name={post.user.name} uri={post.user.avatarUri} />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={{ fontFamily: 'Manrope_700Bold', color: COLORS.text }}>{post.user.name}</Text>
          <Text style={{ fontFamily: 'Manrope_400Regular', color: '#888', fontSize: 12 }}>{post.time}</Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color="#888" />
      </View>

      <Pressable onPress={onImagePress} style={{ backgroundColor: '#f2f2f2' }}>
        <View style={{ width: '100%', aspectRatio: 1 }}>
          <Image source={{ uri: post.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          {showBigHeart ? (
            <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
              <MotiView from={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1.1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={{ type: 'timing', duration: 350 }}>
                <Ionicons name="heart" size={96} color="#fff" style={{ textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }} />
              </MotiView>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
        <Pressable onPress={onToggleLike} hitSlop={10} style={{ marginRight: 16 }}>
          <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={26} color={post.liked ? '#e11d48' : COLORS.text} />
        </Pressable>
        <Pressable onPress={onOpenComments} hitSlop={10} style={{ marginRight: 16 }}>
          <Ionicons name="chatbubble-outline" size={24} color={COLORS.text} />
        </Pressable>
        <Pressable hitSlop={10}><Ionicons name="paper-plane-outline" size={24} color={COLORS.text} /></Pressable>
      </View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
        <Text style={{ fontFamily: 'Manrope_700Bold', color: COLORS.text }}>{post.likes} likes</Text>
        <Text style={{ marginTop: 4, color: COLORS.text }}>
          <Text style={{ fontFamily: 'Manrope_700Bold' }}>{post.user.name} </Text>
          <Text style={{ fontFamily: 'Manrope_400Regular' }}>{post.caption}</Text>
        </Text>
        <Pressable onPress={onOpenComments}>
          <Text style={{ color: '#6b6b6b', marginTop: 6, fontFamily: 'Manrope_400Regular' }}>View comments</Text>
        </Pressable>
      </View>
    </View>
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

function PostDetailScreen({ route }) {
  const { postId } = route.params || {};
  const [post, setPost] = useState(null);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const { data: p } = await supabase.from('posts').select('id, user_id, caption, image_url, created_at').eq('id', postId).single();
      setPost(p);
      const [{ data: ms }, { count: likeCount }] = await Promise.all([
        supabase.from('post_media').select('id, url, media_type, created_at').eq('post_id', postId).order('created_at', { ascending: true }),
        supabase.from('post_likes').select('post_id', { count: 'exact', head: true }).eq('post_id', postId),
      ]);
      setMedia(ms || []); setLikes(likeCount ?? 0);

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: my } = await supabase.from('post_likes').select('post_id').eq('post_id', postId).eq('user_id', session.user.id).maybeSingle();
        setLiked(!!my);
      }
    } catch (e) { alert(e.message || 'Failed to load post'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [postId]);

  const toggleLike = async () => {
    setLiked(v => !v); setLikes(n => Math.max(0, n + (liked ? -1 : 1)));
    try { await ensureAuthed(); await supabase.rpc('toggle_like', { p_post_id: postId }); } catch (e) {}
  };

  if (loading || !post) {
    return (<SafeAreaView edges={['top']} style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator /></SafeAreaView>);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex:1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border }}>
        <Text style={{ fontFamily:'Manrope_700Bold', fontSize: 18, color: COLORS.text }}>Post</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width:'100%', backgroundColor:'#000' }}>
          {media.length ? media.map((m) => (
            <View key={m.id} style={{ width: W, aspectRatio: 1, backgroundColor:'#000' }}>
              {m.media_type === 'video'
                ? <Video source={{ uri: m.url }} style={{ width:'100%', height:'100%' }} resizeMode="contain" shouldPlay />
                : <Image source={{ uri: m.url }} style={{ width:'100%', height:'100%' }} resizeMode="contain" />
              }
            </View>
          )) : (
            <View style={{ width: W, aspectRatio: 1, backgroundColor:'#000' }}>
              <Image source={{ uri: post.image_url }} style={{ width:'100%', height:'100%' }} resizeMode="contain" />
            </View>
          )}
        </ScrollView>

        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal: 12, paddingTop: 10 }}>
          <Pressable onPress={toggleLike} hitSlop={10} style={{ marginRight: 16 }}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? '#e11d48' : COLORS.text} />
          </Pressable>
          <Text style={{ fontFamily:'Manrope_700Bold', color: COLORS.text }}>{likes} likes</Text>
        </View>

        {!!post.caption && (
          <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
            <Text style={{ fontFamily:'Manrope_400Regular', color: COLORS.text }}>{post.caption}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- Create Post ---------------- */
function CreatePostScreen({ navigation }) {
  const [assets, setAssets] = useState([]);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return alert('Permission needed');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.9,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    });
    if (result.canceled) return;
    setAssets(result.assets.map(a => ({ uri: a.uri, type: a.type, width: a.width, height: a.height, duration: a.duration, mimeType: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg') })));
  };

  const submit = async () => {
    if (!assets.length) return alert('Select at least one photo/video');
    setPosting(true);
    try {
      await ensureAuthed();
      const urls = [];
      const types = [];
      for (const a of assets) {
        const url = await uploadToBucket(a.uri, 'posts', a.mimeType);
        urls.push(url);
        types.push(a.type === 'video' ? 'video' : 'image');
      }

      const { error } = await supabase.rpc('create_post_with_media', { p_urls: urls, p_types: types, p_caption: caption || null });
      if (error) throw error;

      navigation.pop();
    } catch (e) {
      alert(e.message || 'Failed to create post');
    } finally { setPosting(false); }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex:1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal:16, paddingTop:10, paddingBottom:6, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
        <Pressable onPress={()=>navigation.goBack()} hitSlop={10}><Ionicons name="chevron-back" size={22} color={COLORS.text} /></Pressable>
        <Text style={{ fontFamily:'Manrope_700Bold', fontSize:16, color:COLORS.text }}>New Post</Text>
        <View style={{ width:22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding:16 }}>
        <Pressable
          onPress={pickMedia}
          style={({pressed})=>({
            borderWidth:1, borderColor:COLORS.border, borderRadius:12, padding:16, alignItems:'center',
            backgroundColor: pressed ? '#fafafa' : '#fff'
          })}
        >
          <Ionicons name="images-outline" size={28} color={COLORS.text} />
          <Text style={{ marginTop:8, fontFamily:'Manrope_600SemiBold', color:COLORS.text }}>Choose up to 10 photos/videos</Text>
        </Pressable>

        {assets.length ? (
          <View style={{ flexDirection:'row', flexWrap:'wrap', marginTop:12, gap:6 }}>
            {assets.map((a, i) => (
              <Image key={i} source={{ uri: a.uri }} style={{ width: (W-16*2-6*3)/4, height: (W-16*2-6*3)/4, borderRadius:8 }} />
            ))}
          </View>
        ) : null}

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption…"
          multiline
          style={{ marginTop:14, minHeight:90, borderWidth:1, borderColor:COLORS.border, borderRadius:12, padding:12, textAlignVertical:'top', fontFamily:'Manrope_400Regular' }}
        />

        <Pressable onPress={submit} disabled={posting} style={({pressed})=>({
          marginTop:16, backgroundColor: COLORS.primary, paddingVertical:12, borderRadius:12, alignItems:'center',
          opacity: pressed||posting ? 0.7 : 1
        })}>
          {posting ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontFamily:'Manrope_700Bold' }}>Post</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- Small UI components ---------------- */
function DevBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: Math.max(insets.top * 0.3, 2), paddingBottom: 6, paddingHorizontal: 12, backgroundColor: '#111' }}>
      <Text numberOfLines={1} style={{ textAlign: 'center', color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 11 }}>
        MOCK MODE (no session)
      </Text>
    </View>
  );
}

function Avatar({ size = 64, name, uri, ripple }) {
  return (
    <View style={{ width: size, alignItems: 'center' }}>
      <View style={{ width: size, height: size, borderRadius: size/2, overflow: 'hidden', backgroundColor: '#f2f2f2', alignItems:'center', justifyContent:'center' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontFamily:'Manrope_700Bold' }}>{getInitials(name)}</Text>}
      </View>
      {ripple ? (
        <MotiView
          from={{ opacity: 0.35, scale: 1 }}
          animate={{ opacity: 0, scale: 1.6 }}
          transition={{ loop: true, type: 'timing', duration: 1600 }}
          style={{ position: 'absolute', top: -2, left: (size*-0.03), width: size*1.06, height: size*1.06, borderRadius: size, borderWidth: 2, borderColor: 'rgba(0,0,0,0.15)' }}
        />
      ) : null}
    </View>
  );
}

function MonoRingWithRipples({ size = 220 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size/2, alignItems:'center', justifyContent:'center' }}>
      <View style={{ position:'absolute', width:size, height:size, borderRadius:size/2, borderWidth:3, borderColor:'rgba(0,0,0,0.35)' }} />
      {[1,2,3].map((i) => (
        <MotiView
          key={i}
          from={{ opacity: 0.25, scale: 0.9 }}
          animate={{ opacity: 0, scale: 1.25 }}
          transition={{ loop: true, delay: i*300, type:'timing', duration: 1600 }}
          style={{ position:'absolute', width:size, height:size, borderRadius:size/2, borderWidth:2, borderColor:'rgba(0,0,0,0.15)' }}
        />
      ))}
    </View>
  );
}

function UnreadBadge({ count }) {
  return (
    <View style={{ backgroundColor: '#000', minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
      <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Manrope_700Bold' }}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

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

  authRoot: { flex: 1, padding: 16, backgroundColor: COLORS.bg },
  authTitle: { fontFamily: 'Manrope_700Bold', fontSize: 22, color: COLORS.text, marginBottom: 6 },
  authCaption: { fontFamily: 'Manrope_400Regular', color: COLORS.subtext },
  input: { marginTop: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, fontFamily: 'Manrope_400Regular' },
  primaryBtn: { marginTop: 14, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  linkText: { color: COLORS.primary, fontFamily: 'Manrope_600SemiBold' },

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

  contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.divider },
  contactName: { flex: 1, fontFamily: 'Manrope_600SemiBold', color: COLORS.text },
  contactNumbers: { flex: 1, textAlign: 'right', fontFamily: 'Manrope_400Regular', color: COLORS.subtext, fontSize: 12 },

  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
});
