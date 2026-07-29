import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { IS_DEVELOPMENT } from '../../config/env';
import { COLORS } from '../../theme/colors';
import {
  formatEnforcementEnd,
  getMyAccountEnforcementState,
} from '../../services/accountEnforcementService';
import { signOut } from '../../services/profileService';
import {
  APPEAL_RESOLUTION_LABELS,
  getMyAccountEnforcementAppeal,
} from '../../services/accountAppealService';

function StatusCard({ enforcement }) {
  const suspended = enforcement?.state === 'suspended';
  return (
    <View style={[styles.statusCard, suspended && styles.suspendedCard]}>
      <View style={[styles.iconWrap, suspended && styles.suspendedIcon]}>
        <Ionicons
          name={suspended ? 'lock-closed' : 'hand-left'}
          size={28}
          color={suspended ? '#9b1c1c' : '#8a4b08'}
        />
      </View>
      <Text style={styles.title}>
        {suspended ? 'Account suspended' : 'Account restricted'}
      </Text>
      <Text style={styles.body}>
        {enforcement?.publicMessage
          || (suspended
            ? 'Normal Circles access is unavailable while this suspension is active.'
            : 'You can view existing Circles content, but creating, messaging, inviting, connecting, reacting, and romantic actions are unavailable.')}
      </Text>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Ends</Text>
        <Text style={styles.detailValue}>
          {formatEnforcementEnd(enforcement?.endsAt)}
        </Text>
      </View>
    </View>
  );
}

export function AccountEnforcementScreen({
  navigation,
  route,
  gate = false,
  initialEnforcement = null,
}) {
  const isGate = gate || Boolean(route?.params?.gate);
  const [enforcement, setEnforcement] = useState(initialEnforcement);
  const [appeal, setAppeal] = useState(null);
  const [loading, setLoading] = useState(!initialEnforcement);
  const [signingOut, setSigningOut] = useState(false);

  const loadAppeal = useCallback(async () => {
    try {
      setAppeal(await getMyAccountEnforcementAppeal());
    } catch {
      setAppeal(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getMyAccountEnforcementState();
      setEnforcement(next);
      await loadAppeal();
    } catch (error) {
      Alert.alert('Account status unavailable', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loadAppeal]);

  useEffect(() => {
    if (!initialEnforcement) load();
    else loadAppeal();
  }, [initialEnforcement, load, loadAppeal]);

  const performSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigation.reset({ index: 0, routes: [{ name: 'Gate' }] });
    } catch (error) {
      Alert.alert('Could not sign out', error?.message || 'Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {!isGate ? (
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBarSide}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={styles.topBarTitle}>Account status</Text>
          <View style={styles.topBarSide} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {enforcement?.active ? (
          <StatusCard enforcement={enforcement} />
        ) : (
          <View style={styles.clearCard}>
            <Ionicons name="shield-checkmark" size={34} color="#237a3b" />
            <Text style={styles.title}>No active account action</Text>
            <Text style={styles.body}>
              Your account currently has normal Circles access.
            </Text>
          </View>
        )}

        {!enforcement?.active ? (
          <Pressable
            onPress={() => navigation.replace('MainTabs')}
            style={({ pressed }) => [styles.returnButton, pressed && styles.pressed]}
          >
            <Text style={styles.returnText}>Return to Circles</Text>
          </Pressable>
        ) : null}

        {appeal?.status === 'resolved' ? (
          <Pressable
            onPress={() => navigation.navigate('AccountAppeal')}
            style={({ pressed }) => [styles.outcomeCard, pressed && styles.pressed]}
          >
            <View style={styles.outcomeIcon}>
              <Ionicons name="document-text-outline" size={20} color="#2855a6" />
            </View>
            <View style={styles.outcomeCopy}>
              <Text style={styles.outcomeTitle}>Appeal review completed</Text>
              <Text style={styles.outcomeText}>
                {APPEAL_RESOLUTION_LABELS[appeal.resolutionCode] || 'Open your appeal to review the outcome.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#6d7890" />
          </Pressable>
        ) : null}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>What remains available</Text>
          <Text style={styles.infoText}>
            Safety reporting, blocking, your report receipts, and signing out remain available. Existing content is preserved; account action does not silently delete your history.
          </Text>
        </View>

        {enforcement?.active || appeal?.hasAppeal ? (
          <Pressable
            onPress={() => navigation.navigate('AccountAppeal')}
            style={({ pressed }) => [styles.appealButton, pressed && styles.pressed]}
          >
            <Ionicons name="chatbox-ellipses-outline" size={19} color="#fff" />
            <Text style={styles.appealButtonText}>
              {appeal?.status === 'resolved'
                ? 'Review Appeal Outcome'
                : appeal?.hasAppeal
                  ? 'View Account Appeal'
                  : 'Appeal Account Action'}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => navigation.navigate('MySafetyReports')}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Ionicons name="document-text-outline" size={19} color={COLORS.text} />
          <Text style={styles.secondaryText}>Reports you submitted</Text>
        </Pressable>

        <Pressable
          onPress={load}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Ionicons name="refresh-outline" size={19} color={COLORS.text} />
          <Text style={styles.secondaryText}>Refresh status</Text>
        </Pressable>

        {IS_DEVELOPMENT ? (
          <Pressable
            onPress={() => navigation.navigate('DevAccounts')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Ionicons name="flask-outline" size={19} color={COLORS.text} />
            <Text style={styles.secondaryText}>Switch test account</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => navigation.navigate('DeleteAccount')}
          style={({ pressed }) => [styles.deleteAccountButton, pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={19} color="#b42318" />
          <Text style={styles.deleteAccountText}>Delete account</Text>
        </Pressable>

        <Pressable
          disabled={signingOut}
          onPress={performSignOut}
          style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
        >
          {signingOut ? <ActivityIndicator color="#b42318" /> : (
            <>
              <Ionicons name="log-out-outline" size={19} color="#b42318" />
              <Text style={styles.signOutText}>Sign out</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  topBarSide: { width: 52, height: 42, alignItems: 'flex-start', justifyContent: 'center' },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 48,
  },
  statusCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1c27d',
    backgroundColor: '#fff8eb',
    padding: 20,
  },
  suspendedCard: { borderColor: '#f0aaa5', backgroundColor: '#fff3f2' },
  clearCard: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    padding: 24,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#ffedcf',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  suspendedIcon: { backgroundColor: '#ffe0de' },
  title: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
    textAlign: 'center',
  },
  body: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  detailRow: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#dfc99f',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  detailLabel: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold' },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  returnButton: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  returnText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  outcomeCard: {
    minHeight: 74,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#c9d7f5',
    backgroundColor: '#eef3ff',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  outcomeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dce7ff',
  },
  outcomeCopy: { flex: 1 },
  outcomeTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  outcomeText: { marginTop: 3, color: '#4e5f83', fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, lineHeight: 17 },
  infoCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    padding: 16,
    marginTop: 18,
    marginBottom: 14,
  },
  infoTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', marginBottom: 6 },
  infoText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  appealButton: { minHeight: 50, marginTop: 2, borderRadius: 14, backgroundColor: COLORS.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  appealButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginBottom: 10,
  },
  secondaryText: { color: COLORS.text, fontFamily: 'Manrope_700Bold' },
  signOutButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#f0aaa5',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 8,
  },
  signOutText: { color: '#b42318', fontFamily: 'Manrope_700Bold' },
  deleteAccountButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f0aaa5',
    backgroundColor: '#fff3f2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  deleteAccountText: { color: '#b42318', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.72 },
});
