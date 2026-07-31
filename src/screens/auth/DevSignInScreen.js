import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
  switchDevAccount,
} from '../../services/devTestService';
import {
  continueAfterProfile,
  getMyOnboardingState,
} from '../../services/onboardingService';
import {
  replaceWithAccountStatus,
  replaceWithMainTabs,
} from '../../navigation/navigationActions';
import { authStyles } from './authStyles';

export function DevSignInScreen({ route, navigation }) {
  const accounts = useMemo(() => getConfiguredDevAccounts(), []);
  const inviteToken = route?.params?.inviteToken || null;
  const eventGuestToken = route?.params?.eventGuestToken || null;
  const [switchingKey, setSwitchingKey] = useState(null);

  const onSelect = async (account) => {
    setSwitchingKey(account.key);
    try {
      const result = await switchDevAccount(account);
      const enforcement = result?.enforcement || { active: false, state: 'active' };

      if (enforcement.active && enforcement.state === 'suspended') {
        replaceWithAccountStatus(navigation);
        return;
      }

      if (enforcement.active && enforcement.state === 'restricted') {
        replaceWithMainTabs(navigation);
        return;
      }

      const onboarding = await getMyOnboardingState();
      if (!onboarding.profileCompleted) {
        navigation.replace('ProfileSetup', {
          inviteToken,
          eventGuestToken,
        });
        return;
      }

      await continueAfterProfile({
        navigation,
        inviteToken,
        eventGuestToken,
      });
    } catch (error) {
      Alert.alert(
        'Could not sign in',
        `${error?.message || 'Development sign-in failed.'}\n\nConfirm the selected account exists in Supabase Authentication and matches .env.local.`
      );
    } finally {
      setSwitchingKey(null);
    }
  };

  return (
    <SafeAreaView style={authStyles.root} edges={['top', 'bottom']}>
      <View style={authStyles.scrollContent}>
        <View style={authStyles.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={authStyles.topBarSide}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={authStyles.topBarTitle}>Development sign-in</Text>
          <View style={authStyles.topBarSide} />
        </View>

        <View style={styles.notice}>
          <Ionicons name="flask-outline" size={24} color={COLORS.text} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Development only</Text>
            <Text style={styles.noticeText}>
              This screen is excluded from production builds. Real email verification remains available while developing.
            </Text>
          </View>
        </View>

        <Text style={authStyles.title}>Choose a test account.</Text>
        <Text style={authStyles.caption}>
          Use an existing isolated account without requesting an email code.
        </Text>

        <View style={styles.accountCard}>
          {accounts.map((account, index) => {
            const switching = switchingKey === account.key;
            return (
              <View key={account.key}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  onPress={() => onSelect(account)}
                  disabled={Boolean(switchingKey)}
                  style={({ pressed }) => [
                    styles.accountRow,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Avatar size={46} name={account.displayName} />
                  <View style={styles.accountText}>
                    <Text style={styles.accountName}>{account.displayName}</Text>
                    <Text style={styles.accountEmail} numberOfLines={1}>
                      {account.email}
                    </Text>
                  </View>
                  {switching ? (
                    <ActivityIndicator />
                  ) : (
                    <Ionicons name="arrow-forward" size={19} color={COLORS.text} />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        {!accounts.length ? (
          <Text style={authStyles.errorText}>
            No development accounts are configured in .env.local.
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    gap: 12,
    padding: 15,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f7f7f7',
    marginTop: 14,
    marginBottom: 30,
  },
  noticeTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  noticeText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  accountCard: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: 18,
    marginTop: 24,
  },
  accountRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  rowPressed: {
    backgroundColor: '#f7f7f7',
  },
  accountText: {
    flex: 1,
    marginHorizontal: 12,
  },
  accountName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  accountEmail: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    marginTop: 3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: 72,
  },
});
