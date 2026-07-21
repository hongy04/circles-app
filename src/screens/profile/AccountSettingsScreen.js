import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';
import { IS_DEVELOPMENT } from '../../config/env';
import { getAccountSession, signOut } from '../../services/profileService';

function SettingRow({ icon, title, subtitle, onPress, destructive = false }) {
  const content = (
    <>
      <View style={[styles.rowIcon, destructive && styles.rowIconDestructive]}>
        <Ionicons
          name={icon}
          size={19}
          color={destructive ? '#b42318' : COLORS.text}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && styles.destructiveText]}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={18} color="#9a9a9a" />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

export function AccountSettingsScreen({ navigation }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    getAccountSession()
      .then((result) => {
        if (mounted) setSession(result);
      })
      .catch((error) => {
        Alert.alert('Account unavailable', error?.message || 'Please sign in again.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const accountIdentifier =
    session?.user?.phone || session?.user?.email || 'Signed-in account';

  const performSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigation.reset({
        index: 0,
        routes: [{ name: 'Gate' }],
      });
    } catch (error) {
      Alert.alert(
        'Could not sign out',
        error?.message || 'Please try again.'
      );
    } finally {
      setSigningOut(false);
    }
  };

  const confirmSignOut = () => {
    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm?.(
        'Sign out of Circles? You will need to verify your account again to return.'
      );
      if (confirmed) performSignOut();
      return;
    }

    Alert.alert(
      'Sign out of Circles?',
      'You will need to verify your account again to return.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: performSignOut,
        },
      ]
    );
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
        <Text style={styles.topBarTitle}>Settings</Text>
        <View style={styles.topBarSide} />
      </View>

      {loading ? (
        <View style={styles.loadingRoot}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>PROFILE</Text>
          <View style={styles.section}>
            <SettingRow
              icon="person-outline"
              title="Edit profile"
              subtitle="Name, username, photo, and bio"
              onPress={() => navigation.navigate('EditProfile')}
            />
          </View>

          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.section}>
            <SettingRow
              icon="shield-checkmark-outline"
              title="Signed in"
              subtitle={accountIdentifier}
            />
            <View style={styles.separator} />
            <SettingRow
              icon="lock-closed-outline"
              title="Private by design"
              subtitle="Profiles and posts are intended for mutuals and accepted connections."
            />
          </View>

          <Text style={styles.sectionLabel}>APP</Text>
          <View style={styles.section}>
            {IS_DEVELOPMENT ? (
              <>
                <SettingRow
                  icon="flask-outline"
                  title="Test accounts"
                  subtitle="Switch identities and exercise multi-user privacy flows"
                  onPress={() => navigation.navigate('DevAccounts')}
                />
                <View style={styles.separator} />
              </>
            ) : null}
            <SettingRow
              icon="information-circle-outline"
              title="Circles"
              subtitle={IS_DEVELOPMENT ? 'Development build' : 'Production build'}
            />
          </View>

          <View style={styles.section}>
            <SettingRow
              icon="log-out-outline"
              title={signingOut ? 'Signing out…' : 'Sign out'}
              destructive
              onPress={signingOut ? undefined : confirmSignOut}
            />
          </View>

          <Text style={styles.footerText}>
            Circles is built for the people you actually know—not public discovery.
          </Text>
        </ScrollView>
      )}
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
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 44,
  },
  sectionLabel: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
    marginLeft: 4,
    marginBottom: 7,
    marginTop: 6,
  },
  section: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    overflow: 'hidden',
    marginBottom: 20,
  },
  row: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  rowPressed: {
    backgroundColor: '#f5f5f5',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f1f1f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowIconDestructive: {
    backgroundColor: '#fff1f0',
  },
  rowText: {
    flex: 1,
    paddingRight: 8,
  },
  rowTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  rowSubtitle: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  destructiveText: {
    color: '#b42318',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: 62,
  },
  footerText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
