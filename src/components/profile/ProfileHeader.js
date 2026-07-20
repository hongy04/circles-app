import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../Avatar';
import { COLORS } from '../../theme/colors';

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RelationshipActions({
  profile,
  busy,
  onConnect,
  onAccept,
  onDecline,
}) {
  const relationship = profile.relationship_status;

  if (relationship === 'self') return null;

  if (relationship === 'connected') {
    return (
      <View style={styles.actionsRow}>
        <View style={styles.connectedButton}>
          <Ionicons name="checkmark-circle" size={18} color={COLORS.text} />
          <Text style={styles.connectedButtonText}>Connected</Text>
        </View>
      </View>
    );
  }

  if (relationship === 'outgoing') {
    return (
      <View style={styles.actionsRow}>
        <View style={styles.connectedButton}>
          <Ionicons name="time-outline" size={18} color={COLORS.subtext} />
          <Text style={styles.connectedButtonText}>Requested</Text>
        </View>
      </View>
    );
  }

  if (relationship === 'incoming') {
    return (
      <View style={styles.actionsRow}>
        <Pressable
          disabled={busy}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || busy) && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Accept</Text>
          )}
        </Pressable>

        <Pressable
          disabled={busy}
          onPress={onDecline}
          style={({ pressed }) => [
            styles.secondaryButton,
            (pressed || busy) && styles.buttonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Decline</Text>
        </Pressable>
      </View>
    );
  }

  if (relationship === 'mutual') {
    return (
      <View style={styles.actionsRow}>
        <Pressable
          disabled={busy}
          onPress={onConnect}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || busy) && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Connect</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return null;
}

export function ProfileHeader({
  profile,
  isSelf,
  busy = false,
  onEdit,
  onConnect,
  onAccept,
  onDecline,
}) {
  const displayName = profile.display_name || (isSelf ? 'You' : 'User');
  const username = profile.username ? `@${profile.username}` : null;

  return (
    <View style={styles.root}>
      <View style={styles.identityRow}>
        <Avatar
          size={88}
          name={displayName}
          uri={profile.avatar_url}
        />

        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>

          {username ? (
            <Text style={styles.username} numberOfLines={1}>
              {username}
            </Text>
          ) : isSelf ? (
            <Text style={styles.usernameHint}>Add a username</Text>
          ) : null}
        </View>
      </View>

      {profile.bio ? (
        <Text style={styles.bio}>{profile.bio}</Text>
      ) : isSelf ? (
        <Text style={styles.bioHint}>Add a short bio so your circle knows it’s you.</Text>
      ) : null}

      <View style={styles.statsRow}>
        <Stat value={profile.post_count || 0} label="Posts" />
        <View style={styles.statDivider} />
        <Stat value={profile.connection_count || 0} label="Connections" />
      </View>

      {isSelf ? (
        <View style={styles.actionsRow}>
          <Pressable
            onPress={onEdit}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Edit profile</Text>
          </Pressable>
        </View>
      ) : (
        <RelationshipActions
          profile={profile}
          busy={busy}
          onConnect={onConnect}
          onAccept={onAccept}
          onDecline={onDecline}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  identityText: {
    flex: 1,
    marginLeft: 16,
  },
  name: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
  },
  username: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  usernameHint: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 3,
  },
  bio: {
    color: COLORS.text,
    fontFamily: 'Manrope_400Regular',
    marginTop: 14,
    lineHeight: 21,
  },
  bioHint: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    marginTop: 14,
    lineHeight: 21,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  statLabel: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: COLORS.border,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  connectedButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#f7f7f7',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
  },
  connectedButtonText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
