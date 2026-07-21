import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import { getConversationDetails } from '../../services/conversationService';

function FeatureCard({ icon, title, body, badge }) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={22} color={COLORS.text} />
      </View>
      <View style={styles.featureText}>
        <View style={styles.featureTitleRow}>
          <Text style={styles.featureTitle}>{title}</Text>
          {badge ? <Text style={styles.featureBadge}>{badge}</Text> : null}
        </View>
        <Text style={styles.featureBody}>{body}</Text>
      </View>
    </View>
  );
}

export function ConversationDetailsScreen({ route, navigation }) {
  const { conversationId } = route.params || {};
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getConversationDetails(conversationId);
      setDetails(result);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this shared private space.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const conversation = details?.conversation;
  const members = details?.members || [];
  const pendingInvitations = details?.pending_invitations || [];

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening shared private space…</Text>
      </View>
    );
  }

  if (error || !conversation) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="lock-closed-outline" size={34} color={COLORS.text} />
        <Text style={styles.errorText}>{error || 'Conversation unavailable.'}</Text>
        <Pressable onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Avatar
            size={92}
            name={conversation.title}
            uri={conversation.avatar_url}
          />
          <Text style={styles.title}>{conversation.title}</Text>
          <View style={styles.privatePill}>
            <Ionicons name="lock-closed" size={13} color={COLORS.text} />
            <Text style={styles.privateText}>
              {conversation.kind === 'direct'
                ? 'Private connection'
                : 'Invitation-only group'}
            </Text>
          </View>
          <Text style={styles.heroBody}>
            This conversation is also a shared private profile. Only accepted
            members can read its chat or see what is preserved here.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>SHARED SPACE</Text>
        <View style={styles.featureStack}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <FeatureCard
              icon="chatbubble-ellipses-outline"
              title="Chat"
              body="The immediate conversation stream for accepted members."
              badge="ACTIVE"
            />
          </Pressable>
          <FeatureCard
            icon="images-outline"
            title="Timeline"
            body="Photos and videos sent in chat will automatically form a faithful shared archive without duplicate uploads."
            badge="NEXT"
          />
          <FeatureCard
            icon="albums-outline"
            title="Posts"
            body="A separate place for deliberate classic posts made specifically for this private circle."
            badge="PLANNED"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>PEOPLE</Text>
          <Text style={styles.countText}>{members.length} accepted</Text>
        </View>
        <View style={styles.peopleCard}>
          {members.map((member, index) => (
            <View key={member.user_id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Pressable
                onPress={() => navigation.navigate('Profile', {
                  userId: member.user_id,
                })}
                style={({ pressed }) => [
                  styles.personRow,
                  pressed && styles.pressed,
                ]}
              >
                <Avatar
                  size={46}
                  name={member.display_name || 'Member'}
                  uri={member.avatar_url}
                />
                <View style={styles.personText}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {member.display_name || 'Member'}
                    {member.is_me ? ' (You)' : ''}
                  </Text>
                  <Text style={styles.personRole}>
                    {member.role === 'owner' ? 'Group owner' : 'Accepted member'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color="#c7c7cc" />
              </Pressable>
            </View>
          ))}
        </View>

        {pendingInvitations.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>PENDING INVITATIONS</Text>
              <Text style={styles.countText}>{pendingInvitations.length}</Text>
            </View>
            <View style={styles.peopleCard}>
              {pendingInvitations.map((invitation, index) => (
                <View key={invitation.invitation_id}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <View style={styles.personRow}>
                    <Avatar
                      size={46}
                      name={invitation.display_name || 'Invited person'}
                      uri={invitation.avatar_url}
                    />
                    <View style={styles.personText}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {invitation.display_name || 'Invited person'}
                      </Text>
                      <Text style={styles.personRole}>
                        Cannot enter until they accept
                      </Text>
                    </View>
                    <View style={styles.invitedPill}>
                      <Text style={styles.invitedText}>Invited</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.text} />
          <Text style={styles.privacyNoteText}>
            Membership is enforced in Supabase, not only hidden in the app. A
            pending invite does not grant access to messages or this page.
          </Text>
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
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 44,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: COLORS.bg,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorText: {
    marginTop: 12,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  retryText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    marginBottom: 24,
  },
  title: {
    marginTop: 13,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
    textAlign: 'center',
  },
  privatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#f1f1f1',
  },
  privateText: {
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  heroBody: {
    marginTop: 12,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionLabel: {
    marginLeft: 4,
    marginBottom: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  featureStack: {
    gap: 10,
    marginBottom: 24,
  },
  featureCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  featureIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#f1f1f1',
  },
  featureText: {
    flex: 1,
    marginLeft: 12,
  },
  featureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  featureBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 7,
    color: COLORS.subtext,
    backgroundColor: '#f1f1f1',
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
  },
  featureBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countText: {
    marginRight: 4,
    marginBottom: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  peopleCard: {
    overflow: 'hidden',
    marginBottom: 24,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  personRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  personText: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  personName: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  personRole: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72,
    backgroundColor: COLORS.border,
  },
  invitedPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#f1f1f1',
  },
  invitedText: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
  },
  privacyNote: {
    flexDirection: 'row',
    padding: 15,
    borderRadius: 14,
    backgroundColor: '#ededed',
  },
  privacyNoteText: {
    flex: 1,
    marginLeft: 10,
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.72,
  },
});
