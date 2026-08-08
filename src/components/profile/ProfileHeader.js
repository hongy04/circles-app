import React, { useMemo } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../Avatar';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { LinearGradient } from 'expo-linear-gradient';
import { WhisperBubbleField } from './WhisperBubbleField';


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
  onWhisperPress,
  whisperVisible = false,
  whisperReady = false,
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

        {whisperVisible ? (
          <Pressable
            onPress={onWhisperPress}
            accessibilityRole="button"
            accessibilityLabel={whisperReady ? 'Whisper' : 'Whisper unavailable right now'}
            style={({ pressed }) => [
              styles.whisperButton,
              !whisperReady && styles.whisperButtonWaiting,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.whisperGlyph}>
              <Ionicons
                name="ear-outline"
                size={22}
                color={whisperReady ? theme.colors.text : theme.colors.subtext}
              />
              <View
                style={[
                  styles.whisperBubble,
                  styles.whisperBubbleLarge,
                  { borderColor: whisperReady ? theme.colors.text : theme.colors.subtext },
                ]}
              />
              <View
                style={[
                  styles.whisperBubble,
                  styles.whisperBubbleSmall,
                  { borderColor: whisperReady ? theme.colors.text : theme.colors.subtext },
                ]}
              />
            </View>
          </Pressable>
        ) : null}
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
  onConnect,
  onAccept,
  onDecline,
  stats,
  onPostsPress,
  onEventsPress,
  onConnectionsPress,
  onWhisperPress,
  whisperVisible = false,
  whisperReady = false,
  incomingWhispers = [],
  onIncomingWhisperPress,
  poppingWhisperId = null,
  onIncomingWhisperPopComplete,
  topInset = 0,
}) {
  const { theme, styles } = useProfileHeaderTheme();
  const displayName = profile.display_name || (isSelf ? 'You' : 'User');
  const username = profile.username ? `@${profile.username}` : null;

  const hasHeaderPhoto = Boolean(profile.profile_header_url);
  const decorated = Boolean(
    hasHeaderPhoto
    || profile.profile_background_url
    || profile.profile_background_color
    || profile.profile_stickers?.length
  );

  return (
    <View style={[styles.root, decorated && styles.decoratedRoot]}>
      {hasHeaderPhoto ? (
        <ImageBackground
          source={{ uri: profile.profile_header_url }}
          resizeMode="cover"
          style={[styles.headerPhoto, { height: 104 + topInset }]}
          imageStyle={styles.headerPhotoImage}
        >
          <LinearGradient
            colors={['rgba(10,18,34,0.02)', 'rgba(10,18,34,0.18)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </ImageBackground>
      ) : null}

      {isSelf && incomingWhispers.length > 0 ? (
        <WhisperBubbleField
          whispers={incomingWhispers}
          hasHeaderPhoto={hasHeaderPhoto}
          topInset={topInset}
          onWhisperPress={onIncomingWhisperPress}
          poppingWhisperId={poppingWhisperId}
          onWhisperPopComplete={onIncomingWhisperPopComplete}
        />
      ) : null}

      <View style={[styles.identityRow, hasHeaderPhoto && styles.identityRowWithHeader]}>
        <View style={hasHeaderPhoto ? styles.avatarFrameOnHeader : null}>
          <Avatar
            size={hasHeaderPhoto ? 76 : 82}
            name={displayName}
            uri={profile.avatar_url}
          />
        </View>

        <View style={[styles.identityText, hasHeaderPhoto && styles.identityTextWithHeader]}>
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

      {!isSelf ? (
        <RelationshipActions
          profile={profile}
          busy={busy}
          onConnect={onConnect}
          onAccept={onAccept}
          onDecline={onDecline}
          onWhisperPress={onWhisperPress}
          whisperVisible={whisperVisible}
          whisperReady={whisperReady}
        />
      ) : null}
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  root: {
    position: 'relative',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  decoratedRoot: {
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  headerPhoto: {
    height: 104,
    marginHorizontal: -18,
    marginTop: -12,
    marginBottom: 0,
    overflow: 'hidden',
  },
  headerPhotoImage: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  identityRowWithHeader: {
    marginTop: -23,
    alignItems: 'flex-start',
  },
  avatarFrameOnHeader: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityTextWithHeader: {
    paddingTop: 28,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  identityText: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
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
    marginTop: 10,
    lineHeight: 20,
  },
  bioHint: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    marginTop: 10,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 9,
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
    flexDirection: 'row',
    gap: 6,
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
  whisperButton: {
    width: 46,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whisperButtonWaiting: {
    backgroundColor: theme.colors.surfaceSoft,
    opacity: 0.72,
  },
  whisperGlyph: {
    width: 30,
    height: 30,
    position: 'relative',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  whisperBubble: {
    position: 'absolute',
    borderWidth: 1.1,
    backgroundColor: 'transparent',
  },
  whisperBubbleLarge: {
    width: 7,
    height: 7,
    borderRadius: 4,
    right: 0,
    top: 3,
  },
  whisperBubbleSmall: {
    width: 4,
    height: 4,
    borderRadius: 2,
    right: 1,
    top: 14,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  });
}
