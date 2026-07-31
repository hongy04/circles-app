import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '../../components/Avatar';
import { getConversationDetails } from '../../services/conversationService';
import { listTwoPersonPlans } from '../../services/twoPersonPlanService';
import { listTwoPersonImportantDates } from '../../services/twoPersonImportantDateService';
import { listTwoPersonThoughts } from '../../services/twoPersonThoughtService';
import { listTwoPersonAlbums } from '../../services/twoPersonAlbumService';
import { getCirclePeople } from '../../services/circlePeopleService';
import {
  CircleThemeBoundary,
  useCircleThemeSettings,
} from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { getTheme } from '../../theme/themes';

function FeatureRow({ icon, title, subtitle, value, onPress, styles, theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={theme.circle.accent} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {value != null ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
    </Pressable>
  );
}

function Separator({ styles }) {
  return <View style={styles.separator} />;
}

function CircleMoreContent({ route, navigation }) {
  const { conversationId, circleName = 'Circle' } = route.params || {};
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { sharedThemeId, canCustomize } = useCircleThemeSettings();
  const [details, setDetails] = useState(null);
  const [plans, setPlans] = useState([]);
  const [importantDates, setImportantDates] = useState([]);
  const [thoughts, setThoughts] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [canInvite, setCanInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError('');

    try {
      const result = await getConversationDetails(conversationId);
      const conversation = result?.conversation;
      const isCircle = conversation?.kind === 'group'
        || Boolean(conversation?.circle_enabled);

      if (!isCircle) {
        throw new Error('This conversation does not have a Circle profile.');
      }

      if (
        conversation?.kind === 'direct'
        && !conversation?.circle_access_active
      ) {
        throw new Error('Our Circle is currently closed.');
      }

      setDetails(result);

      if (conversation?.kind !== 'direct') {
        setPlans([]);
        setImportantDates([]);
        setThoughts([]);
        setAlbums([]);

        try {
          const people = await getCirclePeople(conversationId);
          setCanInvite(Boolean(people?.permissions?.canInvite));
        } catch {
          setCanInvite(false);
        }
        return;
      }

      setCanInvite(false);

      const results = await Promise.allSettled([
        listTwoPersonPlans(conversationId),
        listTwoPersonImportantDates(conversationId),
        listTwoPersonThoughts(conversationId),
        listTwoPersonAlbums(conversationId),
      ]);

      setPlans(results[0].status === 'fulfilled' ? results[0].value : []);
      setImportantDates(results[1].status === 'fulfilled' ? results[1].value : []);
      setThoughts(results[2].status === 'fulfilled' ? results[2].value : []);
      setAlbums(results[3].status === 'fulfilled' ? results[3].value : []);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this Circle’s features.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const conversation = details?.conversation;
  const isTwoPersonCircle = conversation?.kind === 'direct';
  const resolvedCircleName = conversation?.title || circleName;
  const activePlans = plans.filter((plan) => plan.status !== 'completed').length;
  const completedPlans = plans.filter((plan) => plan.status === 'completed').length;
  const sharedThoughts = thoughts.filter((thought) => thought.status === 'shared').length;
  const draftThoughts = thoughts.filter((thought) => thought.status === 'draft').length;
  const photoCount = albums.reduce(
    (sum, album) => sum + Number(album.photoCount || 0),
    0
  );
  const themeSubtitle = sharedThemeId
    ? `${getTheme(sharedThemeId).name} is shared with every member.`
    : 'Uses each member’s own global app theme.';

  const open = (screen, params = {}) => {
    navigation.navigate(screen, {
      conversationId,
      circleName: resolvedCircleName,
      ...params,
    });
  };

  if (loading && !conversation) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={styles.stateText}>Opening Circle features…</Text>
      </SafeAreaView>
    );
  }

  if (error && !conversation) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={38} color={theme.colors.text} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          onPress={load}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.contentWidth}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={theme.circle.headerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.identityCard}
          >
            <View style={[styles.decal, styles.decalOne, { backgroundColor: theme.circle.decalPalette[1] }]} />
            <View style={[styles.decal, styles.decalTwo, { backgroundColor: theme.circle.decalPalette[3] }]} />
            <Avatar
              size={62}
              name={resolvedCircleName}
              uri={conversation?.avatar_url}
            />
            <View style={styles.identityCopy}>
              <Text style={styles.identityTitle} numberOfLines={2}>
                {resolvedCircleName}
              </Text>
              <View style={styles.privacyRow}>
                <Ionicons name="lock-closed" size={12} color={theme.colors.subtext} />
                <Text style={styles.privacyText}>
                  {isTwoPersonCircle
                    ? 'Private to the two of you'
                    : 'Invitation-only Circle'}
                </Text>
              </View>
            </View>
          </LinearGradient>

          <Text style={styles.sectionLabel}>
            {isTwoPersonCircle ? 'SHARED FEATURES' : 'CIRCLE'}
          </Text>
          <View style={styles.section}>
            {isTwoPersonCircle ? (
              <>
                <FeatureRow
                  icon="sparkles-outline"
                  title="Shared Plans"
                  subtitle={plans.length
                    ? `${activePlans} active · ${completedPlans} ${completedPlans === 1 ? 'memory' : 'memories'}`
                    : 'Keep ideas, schedule them together, and preserve memories.'}
                  value={plans.length}
                  onPress={() => open('TwoPersonPlans')}
                  styles={styles}
                  theme={theme}
                />
                <Separator styles={styles} />
                <FeatureRow
                  icon="calendar-outline"
                  title="Important Dates"
                  subtitle={importantDates.length
                    ? 'Dates, trips, and traditions saved in your shared story.'
                    : 'Keep anniversaries, birthdays, trips, and traditions.'}
                  value={importantDates.length}
                  onPress={() => open('TwoPersonImportantDates')}
                  styles={styles}
                  theme={theme}
                />
                <Separator styles={styles} />
                <FeatureRow
                  icon="document-text-outline"
                  title="Write Your Thoughts"
                  subtitle={thoughts.length
                    ? `${sharedThoughts} shared · ${draftThoughts} private ${draftThoughts === 1 ? 'draft' : 'drafts'}`
                    : 'Write privately and share only when the words feel ready.'}
                  onPress={() => open('TwoPersonThoughts')}
                  styles={styles}
                  theme={theme}
                />
                <Separator styles={styles} />
                <FeatureRow
                  icon="albums-outline"
                  title="Shared Albums"
                  subtitle={albums.length
                    ? `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'} across deliberate collections.`
                    : 'Keep trips, dates, and meaningful occasions together.'}
                  value={albums.length}
                  onPress={() => open('TwoPersonAlbums')}
                  styles={styles}
                  theme={theme}
                />
              </>
            ) : (
              <>
                <FeatureRow
                  icon="calendar-outline"
                  title="Plans & Events"
                  subtitle="Create events, availability polls, and private RSVPs."
                  onPress={() => open('CircleEvents')}
                  styles={styles}
                  theme={theme}
                />
                {canInvite ? (
                  <>
                    <Separator styles={styles} />
                    <FeatureRow
                      icon="person-add-outline"
                      title="Invite People"
                      subtitle="Invite accepted connections or share a private Circle link."
                      onPress={() => open('InviteCirclePeople')}
                      styles={styles}
                      theme={theme}
                    />
                  </>
                ) : null}
                {conversation?.can_edit ? (
                  <>
                    <Separator styles={styles} />
                    <FeatureRow
                      icon="create-outline"
                      title="Edit Circle"
                      subtitle="Update the shared name, photo, and description."
                      onPress={() => open('EditCircle')}
                      styles={styles}
                      theme={theme}
                    />
                  </>
                ) : null}
              </>
            )}
          </View>

          {isTwoPersonCircle && conversation?.can_edit ? (
            <>
              <Text style={styles.sectionLabel}>OUR CIRCLE</Text>
              <View style={styles.section}>
                <FeatureRow
                  icon="create-outline"
                  title="Edit Our Circle"
                  subtitle="Update your shared name, photo, and quiet message."
                  onPress={() => open('EditCircle')}
                  styles={styles}
                  theme={theme}
                />
              </View>
            </>
          ) : null}

          {canCustomize ? (
            <>
              <Text style={styles.sectionLabel}>PERSONALIZATION</Text>
              <View style={styles.section}>
                <FeatureRow
                  icon="color-palette-outline"
                  title="Customize Circle"
                  subtitle={themeSubtitle}
                  onPress={() => open('CustomizeCircle')}
                  styles={styles}
                  theme={theme}
                />
              </View>
            </>
          ) : null}

          <Text style={styles.sectionLabel}>SETTINGS</Text>
          <View style={styles.section}>
            <FeatureRow
              icon="notifications-outline"
              title="Notifications"
              subtitle={isTwoPersonCircle
                ? 'Mute this private conversation or choose which activity alerts you.'
                : 'Mute this Circle or choose which private activity alerts you.'}
              onPress={() => open('ConversationNotificationSettings')}
              styles={styles}
              theme={theme}
            />
          </View>

          {error ? <Text style={styles.inlineError}>{error}</Text> : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

export function CircleMoreScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CircleMoreContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.circle.profileBackground,
    },
    contentWidth: {
      flex: 1,
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      borderLeftWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
      borderRightWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
      borderColor: theme.colors.border,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 44,
    },
    identityCard: {
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 15,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accent,
    },
    decal: {
      position: 'absolute',
      borderRadius: 999,
      opacity: 0.16,
    },
    decalOne: {
      width: 82,
      height: 82,
      top: -34,
      right: -15,
    },
    decalTwo: {
      width: 42,
      height: 42,
      bottom: -18,
      left: 96,
    },
    identityCopy: {
      flex: 1,
      marginLeft: 14,
    },
    identityTitle: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 18,
      lineHeight: 23,
    },
    privacyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 5,
    },
    privacyText: {
      color: theme.colors.subtext,
      fontFamily: theme.typography.semibold,
      fontSize: 11,
    },
    sectionLabel: {
      marginTop: 24,
      marginBottom: 8,
      marginLeft: 4,
      color: theme.colors.subtext,
      fontFamily: theme.typography.bold,
      fontSize: 10.5,
      letterSpacing: 0.8,
    },
    section: {
      overflow: 'hidden',
      borderRadius: 17,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    row: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    rowIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      backgroundColor: theme.circle.accentSoft,
    },
    rowCopy: {
      flex: 1,
      marginHorizontal: 12,
    },
    rowTitle: {
      color: theme.colors.text,
      fontFamily: theme.typography.bold,
      fontSize: 14,
    },
    rowSubtitle: {
      marginTop: 3,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
      fontSize: 11,
      lineHeight: 16,
    },
    rowValue: {
      minWidth: 22,
      marginRight: 8,
      color: theme.circle.accent,
      fontFamily: theme.typography.bold,
      fontSize: 12,
      textAlign: 'right',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 66,
      backgroundColor: theme.colors.border,
    },
    inlineError: {
      marginTop: 18,
      color: theme.colors.danger,
      fontFamily: theme.typography.semibold,
      fontSize: 12,
      textAlign: 'center',
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      backgroundColor: theme.circle.profileBackground,
    },
    stateText: {
      marginTop: 10,
      color: theme.colors.subtext,
      fontFamily: theme.typography.regular,
    },
    errorText: {
      maxWidth: 420,
      marginTop: 12,
      color: theme.colors.text,
      fontFamily: theme.typography.semibold,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    retryButton: {
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: theme.circle.accent,
    },
    retryText: {
      color: theme.welcome.brandInk,
      fontFamily: theme.typography.bold,
      fontSize: 13,
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
