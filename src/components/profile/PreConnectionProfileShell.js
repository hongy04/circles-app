import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { timeAgo } from '../../utils/timeAgo';


function useShellTheme() {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return { theme, styles };
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function ContextChip({ icon, label }) {
  const { theme, styles } = useShellTheme();

  return (
    <View style={styles.contextChip}>
      <Ionicons name={icon} size={14} color={theme.colors.text} />
      <Text style={styles.contextChipText}>{label}</Text>
    </View>
  );
}

function buildContext(profile) {
  const items = [];
  const mutualConnections = Number(profile?.mutual_connection_count || 0);
  const sharedCircles = Number(profile?.shared_circle_count || 0);
  const sharedEvents = Number(profile?.shared_event_count || 0);
  const latestSharedEventTitle = String(
    profile?.latest_shared_event_title || ''
  ).trim();

  if (latestSharedEventTitle) {
    items.push({
      key: 'latest-event',
      icon: 'calendar-outline',
      label: `Met at ${latestSharedEventTitle}`,
    });
  }

  if (sharedEvents > 1) {
    items.push({
      key: 'events',
      icon: 'calendar-number-outline',
      label: pluralize(sharedEvents, 'shared event'),
    });
  }

  if (mutualConnections > 0) {
    items.push({
      key: 'connections',
      icon: 'people-outline',
      label: pluralize(mutualConnections, 'mutual connection'),
    });
  }

  if (sharedCircles > 0) {
    items.push({
      key: 'circles',
      icon: 'ellipse-outline',
      label: pluralize(sharedCircles, 'shared Circle'),
    });
  }

  if (profile?.has_contact_context) {
    items.push({
      key: 'contact',
      icon: 'person-outline',
      label: 'Mutual contact',
    });
  }

  if (!items.length) {
    items.push({
      key: 'request',
      icon: 'link-outline',
      label: 'Connection request',
    });
  }

  return items;
}

function SelectedPreview({ profile }) {
  const { theme, styles } = useShellTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const hasPreview = Boolean(profile?.preview_post_id);
  const isVideo = profile?.preview_media_type === 'video';
  const canShowImage = Boolean(profile?.preview_url) && !isVideo && !imageFailed;
  const previewAge = profile?.preview_created_at
    ? timeAgo(profile.preview_created_at)
    : '';

  useEffect(() => {
    setImageFailed(false);
  }, [profile?.preview_url]);

  if (!hasPreview) {
    return (
      <View style={styles.noPreviewCard}>
        <View style={styles.noPreviewIcon}>
          <Ionicons name="eye-off-outline" size={22} color={theme.colors.subtext} />
        </View>
        <View style={styles.noPreviewText}>
          <Text style={styles.noPreviewTitle}>No preview selected</Text>
          <Text style={styles.noPreviewBody}>
            They have not chosen a post to show before connecting.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.previewCard}>
      <View style={styles.previewHeadingRow}>
        <View>
          <Text style={styles.sectionEyebrow}>CHOSEN PREVIEW</Text>
          <Text style={styles.previewHeading}>A small introduction</Text>
        </View>
        {previewAge ? <Text style={styles.previewAge}>{previewAge}</Text> : null}
      </View>

      <View style={styles.previewMedia}>
        <View style={styles.previewFallback}>
          <Ionicons
            name={isVideo ? 'play-circle-outline' : 'image-outline'}
            size={52}
            color="#fff"
          />
          <Text style={styles.previewFallbackText}>
            {isVideo ? 'Video preview' : 'Post preview'}
          </Text>
        </View>

        {canShowImage ? (
          <Image
            source={{ uri: profile.preview_url }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : null}

        <View style={styles.previewBadge}>
          <Ionicons name="eye" size={13} color="#fff" />
          <Text style={styles.previewBadgeText}>Mutuals preview</Text>
        </View>

        {Number(profile?.preview_media_count || 0) > 1 ? (
          <View style={styles.mediaCountBadge}>
            <Ionicons name="copy-outline" size={13} color="#fff" />
            <Text style={styles.mediaCountText}>
              {profile.preview_media_count}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.previewCaptionWrap}>
        {profile?.preview_caption ? (
          <Text style={styles.previewCaption}>
            <Text style={styles.previewAuthor}>
              {profile.display_name || 'User'}{' '}
            </Text>
            {profile.preview_caption}
          </Text>
        ) : (
          <Text style={styles.previewCaptionMuted}>
            This post was intentionally selected for people with trusted context.
          </Text>
        )}
      </View>
    </View>
  );
}

export function PreConnectionProfileShell({ profile }) {
  const { theme, styles } = useShellTheme();
  const contexts = useMemo(() => buildContext(profile), [profile]);

  return (
    <View style={styles.root}>
      <View style={styles.contextSection}>
        <Text style={styles.sectionEyebrow}>WHY YOU CAN SEE THIS PROFILE</Text>
        <Text style={styles.contextTitle}>You already share real context</Text>
        <Text style={styles.contextBody}>
          Context makes this person discoverable. It does not unlock their private profile.
        </Text>

        <View style={styles.contextChips}>
          {contexts.map((item) => (
            <ContextChip key={item.key} icon={item.icon} label={item.label} />
          ))}
        </View>
      </View>

      <SelectedPreview profile={profile} />

      <View style={styles.lockCard}>
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed-outline" size={20} color={theme.colors.text} />
        </View>
        <View style={styles.lockText}>
          <Text style={styles.lockTitle}>Everything else stays private</Text>
          <Text style={styles.lockBody}>
            Posts, connection details, and messaging unlock only after both people accept the connection.
          </Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingBottom: 34,
    gap: 16,
  },
  sectionEyebrow: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  contextSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingTop: 18,
  },
  contextTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    marginTop: 5,
  },
  contextBody: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  contextChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 13,
  },
  contextChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSoft,
  },
  contextChipText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  noPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 16,
    backgroundColor: theme.colors.surfaceSoft,
  },
  noPreviewIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  noPreviewText: {
    flex: 1,
    marginLeft: 12,
  },
  noPreviewTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
  },
  noPreviewBody: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  previewCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  previewHeadingRow: {
    minHeight: 70,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewHeading: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    marginTop: 3,
  },
  previewAge: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  previewMedia: {
    height: 310,
    backgroundColor: '#2f2f2f',
  },
  previewFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFallbackText: {
    color: '#fff',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 8,
  },
  previewBadge: {
    position: 'absolute',
    top: 11,
    left: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  previewBadgeText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
  mediaCountBadge: {
    position: 'absolute',
    top: 11,
    right: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  mediaCountText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
  },
  previewCaptionWrap: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  previewCaption: {
    color: theme.colors.text,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },
  previewAuthor: {
    fontFamily: 'Manrope_700Bold',
  },
  previewCaptionMuted: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  lockCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 15,
    backgroundColor: theme.colors.surfaceSoft,
  },
  lockIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  lockText: {
    flex: 1,
    marginLeft: 11,
  },
  lockTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
  },
  lockBody: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  });
}
