import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../Avatar';
import { useThemeTokens } from '../../theme/ThemeProvider';


function useProfileHeaderTheme() {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return { theme, styles };
}

function Stat({ value, label, onPress, accessibilityHint }) {
  const { styles } = useProfileHeaderTheme();
  const content = (
    <>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
    </>
  );

  if (!onPress) {
    return <View style={styles.stat}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.stat, pressed && styles.statPressed]}
    >
      {content}
    </Pressable>
  );
}

function RelationshipActions({
  profile,
  busy,
  onConnect,
  onAccept,
  onDecline,
}) {
  const { theme, styles } = useProfileHeaderTheme();
  const relationship = profile.relationship_status;

  if (relationship === 'self') return null;

  if (relationship === 'connected') {
    return (
      <View style={styles.actionsRow}>
        <View style={styles.connectedButton}>
          <Ionicons name="checkmark-circle" size={18} color={theme.colors.text} />
          <Text style={styles.connectedButtonText}>Connected</Text>
        </View>
      </View>
    );
  }

  if (relationship === 'outgoing') {
    return (
      <View style={styles.actionsRow}>
        <View style={styles.connectedButton}>
          <Ionicons name="time-outline" size={18} color={theme.colors.subtext} />
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
            <ActivityIndicator color={theme.colors.onPrimary} size="small" />
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
            <ActivityIndicator color={theme.colors.onPrimary} size="small" />
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
  showStats = true,
  busy = false,
  onEdit,
  onConnect,
  onAccept,
  onDecline,
  stats,
  onPostsPress,
  onEventsPress,
  onConnectionsPress,
}) {
  const { styles } = useProfileHeaderTheme();
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

      {showStats ? (
        <View style={styles.statsRow}>
          <Stat
            value={stats?.postCount ?? profile.post_count ?? 0}
            label="Posts"
            onPress={onPostsPress}
            accessibilityHint="Open this profile’s posts"
          />
          <View style={styles.statDivider} />
          <Stat
            value={stats?.eventCount ?? 0}
            label={stats?.mode === 'connected' ? 'Shared events' : 'Events'}
            onPress={onEventsPress}
            accessibilityHint={stats?.mode === 'connected'
              ? 'Open events you both attended'
              : 'Open your private event history'}
          />
          <View style={styles.statDivider} />
          <Stat
            value={stats?.connectionCount ?? 0}
            label={stats?.mode === 'connected' ? 'Mutual connections' : 'Connections'}
            onPress={onConnectionsPress}
            accessibilityHint={stats?.mode === 'connected'
              ? 'Open people you are both connected with'
              : 'Open your accepted connections'}
          />
        </View>
      ) : null}

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

function createStyles(theme) {
  return StyleSheet.create({
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
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
  },
  username: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  usernameHint: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 3,
  },
  bio: {
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
    marginTop: 14,
    lineHeight: 21,
  },
  bioHint: {
    color: theme.colors.subtext,
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
    borderColor: theme.colors.border,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  statLabel: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center',
  },
  statPressed: {
    opacity: 0.55,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: theme.colors.border,
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
    backgroundColor: theme.circle.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: theme.colors.onPrimary,
    fontFamily: 'Manrope_700Bold',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
  },
  connectedButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
  },
  connectedButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  });
}
