import React, { useEffect, useMemo, useState } from 'react';
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
import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import {
  getConfiguredDevAccounts,
  getCurrentDevSession,
  prepareDevTestNetwork,
  resetDevTestRelationships,
  switchDevAccount,
} from '../../services/devTestService';

export function DevAccountsScreen({ navigation }) {
  const accounts = useMemo(() => getConfiguredDevAccounts(), []);
  const [currentEmail, setCurrentEmail] = useState(null);
  const [switchingEmail, setSwitchingEmail] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [preparedCount, setPreparedCount] = useState(null);

  const refreshCurrent = async () => {
    const session = await getCurrentDevSession();
    setCurrentEmail(session?.user?.email?.toLowerCase() || null);
  };

  useEffect(() => {
    refreshCurrent().catch((error) => {
      Alert.alert('Account unavailable', error?.message || 'Please try again.');
    });
  }, []);

  const onPrepare = async () => {
    setPreparing(true);
    try {
      const rows = await prepareDevTestNetwork();
      setPreparedCount(rows.length);
      Alert.alert(
        'Test network ready',
        `${rows.length} development account${rows.length === 1 ? '' : 's'} found. They now appear as mutual-contact candidates until connected.`
      );
    } catch (error) {
      Alert.alert(
        'Could not prepare accounts',
        error?.message || 'Run the Step 8 migration and try again.'
      );
    } finally {
      setPreparing(false);
    }
  };

  const onReset = () => {
    Alert.alert(
      'Reset test relationships?',
      'Pending requests and accepted connections between development accounts will be removed. Their posts, stories, comments, and profiles will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              const result = await resetDevTestRelationships();
              Alert.alert(
                'Relationships reset',
                `${result.requests_deleted || 0} request record(s) and ${result.connections_deleted || 0} connection row(s) removed.`
              );
            } catch (error) {
              Alert.alert(
                'Reset failed',
                error?.message || 'Please try again.'
              );
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  };

  const onSwitch = async (account) => {
    const normalizedEmail = account.email.toLowerCase();
    if (normalizedEmail === currentEmail) return;

    setSwitchingEmail(normalizedEmail);
    try {
      await switchDevAccount(account);
      setCurrentEmail(normalizedEmail);
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    } catch (error) {
      Alert.alert(
        'Could not switch account',
        `${error?.message || 'Sign-in failed.'}\n\nConfirm this exact email exists as a confirmed user in Supabase Authentication and that its local .env password matches.`
      );
    } finally {
      setSwitchingEmail(null);
    }
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
        <Text style={styles.topBarTitle}>Test Accounts</Text>
        <View style={styles.topBarSide} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.notice}>
          <Ionicons name="flask-outline" size={23} color={COLORS.text} />
          <View style={styles.noticeText}>
            <Text style={styles.noticeTitle}>Development only</Text>
            <Text style={styles.noticeBody}>
              These accounts are isolated test identities. This screen and its
              switching controls are excluded from production builds.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>CONFIGURED ACCOUNTS</Text>
        <View style={styles.card}>
          {accounts.map((account, index) => {
            const email = account.email.toLowerCase();
            const isCurrent = email === currentEmail;
            const isSwitching = switchingEmail === email;

            return (
              <View key={account.key}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <View style={styles.accountRow}>
                  <Avatar size={46} name={account.displayName} />
                  <View style={styles.accountText}>
                    <Text style={styles.accountName}>{account.displayName}</Text>
                    <Text style={styles.accountEmail} numberOfLines={1}>
                      {account.email}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => onSwitch(account)}
                    disabled={isCurrent || Boolean(switchingEmail)}
                    style={({ pressed }) => [
                      styles.switchButton,
                      isCurrent && styles.currentButton,
                      (pressed || isSwitching) && styles.pressed,
                    ]}
                  >
                    {isSwitching ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text
                        style={[
                          styles.switchButtonText,
                          isCurrent && styles.currentButtonText,
                        ]}
                      >
                        {isCurrent ? 'Current' : 'Switch'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        {accounts.length < 2 ? (
          <View style={styles.warning}>
            <Ionicons name="alert-circle-outline" size={20} color="#8a4b08" />
            <Text style={styles.warningText}>
              Only one account is configured. Add account 2 and account 3 to
              .env.local, then restart Expo with --clear.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>TEST NETWORK</Text>
        <View style={styles.card}>
          <Pressable
            onPress={onPrepare}
            disabled={preparing || Boolean(switchingEmail)}
            style={({ pressed }) => [
              styles.actionRow,
              (pressed || preparing) && styles.pressed,
            ]}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="people-outline" size={20} color={COLORS.text} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Prepare mutual candidates</Text>
              <Text style={styles.actionSubtitle}>
                Creates missing public test profiles and mutual-contact edges.
                {preparedCount !== null ? ` Last found: ${preparedCount}.` : ''}
              </Text>
            </View>
            {preparing ? (
              <ActivityIndicator />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
            )}
          </Pressable>

          <View style={styles.separatorIndented} />

          <Pressable
            onPress={onReset}
            disabled={resetting || Boolean(switchingEmail)}
            style={({ pressed }) => [
              styles.actionRow,
              (pressed || resetting) && styles.pressed,
            ]}
          >
            <View style={[styles.actionIcon, styles.resetIcon]}>
              <Ionicons name="refresh-outline" size={20} color="#b42318" />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, styles.resetTitle]}>
                Reset requests and connections
              </Text>
              <Text style={styles.actionSubtitle}>
                Keeps content, but returns all test identities to mutual-only.
              </Text>
            </View>
            {resetting ? <ActivityIndicator /> : null}
          </Pressable>
        </View>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>Recommended test order</Text>
          <Text style={styles.step}>1. Prepare the test network.</Text>
          <Text style={styles.step}>2. From Hongy, request Alex.</Text>
          <Text style={styles.step}>3. Switch to Alex and accept.</Text>
          <Text style={styles.step}>4. Create a post and story as Alex.</Text>
          <Text style={styles.step}>5. Switch back and test privacy, likes, comments, and ownership.</Text>
          <Text style={styles.step}>6. Reset relationships and repeat decline/pending states.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
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
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  content: {
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 44,
  },
  notice: {
    flexDirection: 'row',
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    marginBottom: 22,
  },
  noticeText: {
    flex: 1,
    marginLeft: 12,
  },
  noticeTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  noticeBody: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  sectionTitle: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
    marginLeft: 4,
    marginBottom: 7,
  },
  card: {
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    marginBottom: 22,
  },
  accountRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  accountText: {
    flex: 1,
    marginHorizontal: 12,
  },
  accountName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  accountEmail: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  switchButton: {
    minWidth: 76,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
  },
  currentButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#f2f2f2',
  },
  switchButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  currentButtonText: {
    color: COLORS.text,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: 72,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    backgroundColor: '#fff6e8',
    padding: 12,
    marginTop: -10,
    marginBottom: 22,
  },
  warningText: {
    flex: 1,
    color: '#8a4b08',
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 8,
  },
  actionRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#f1f1f1',
    marginRight: 12,
  },
  resetIcon: {
    backgroundColor: '#fff1f0',
  },
  actionText: {
    flex: 1,
    paddingRight: 10,
  },
  actionTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  resetTitle: {
    color: '#b42318',
  },
  actionSubtitle: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  separatorIndented: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: 64,
  },
  stepsCard: {
    borderRadius: 14,
    backgroundColor: '#111',
    padding: 16,
  },
  stepsTitle: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 8,
  },
  step: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.7,
  },
});
