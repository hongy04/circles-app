import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ImageBackground,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { WhisperComposerSheet } from '../../components/profile/WhisperComposerSheet';
import { RomanceProfileSheet } from '../../components/profile/RomanceProfileSheet';
import { PreConnectionProfileShell } from '../../components/profile/PreConnectionProfileShell';
import { ProfilePostGridItem } from '../../components/profile/ProfilePostGridItem';
import { StickerCanvas } from '../../components/decorations/StickerCanvas';
import { PostOwnerMenu } from '../../components/posts/PostOwnerMenu';
import { deleteOwnPost } from '../../services/postService';
import { blockUser } from '../../services/safetyService';
import {
  fetchRomanticInterestStatus,
  fetchTwoPersonCircleProposalStatus,
  proposeTwoPersonCircle,
  respondToTwoPersonCircleProposal,
  setMyRomanticFocus,
  setMyRomanticInterest,
} from '../../services/romanticService';
import {
  fetchMyMutualPreviewPostId,
  fetchProfilePage,
  respondToProfileRequest,
  removeProfileConnection,
  setMyMutualPreviewPost,
  sendProfileConnectionRequest,
} from '../../services/profileService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';
import { getWhisperSendEligibility, sendWhisper } from '../../services/whisperService';


function useProfileTheme() {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return { theme, styles };
}

function preserveProfileDecorationImageUrls(current, next) {
  if (!next || !current || current.id !== next.id) return next;

  const currentAssets = new Map(
    (current.profile_custom_stickers || []).map((asset) => [String(asset?.id || ''), asset])
  );

  return {
    ...next,
    profile_header_url:
      current.profile_header_path
      && current.profile_header_path === next.profile_header_path
        ? current.profile_header_url
        : next.profile_header_url,
    profile_background_url:
      current.profile_background_path
      && current.profile_background_path === next.profile_background_path
        ? current.profile_background_url
        : next.profile_background_url,
    profile_custom_stickers: (next.profile_custom_stickers || []).map((asset) => {
      const previous = currentAssets.get(String(asset?.id || ''));
      if (previous?.path && previous.path === asset?.path && previous.url) {
        return { ...asset, url: previous.url };
      }
      return asset;
    }),
  };
}

function TopBar({
  isSelf,
  navigation,
  onManageSelf,
  onManageProfile,
  romanceIcon = null,
  onRomancePress,
  romanceBusy = false,
  overlay = false,
  topInset = 0,
  decorated = false,
}) {
  const { theme, styles } = useProfileTheme();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.topBar,
        decorated && !overlay && styles.decoratedTopBar,
        overlay && [styles.topBarOverlay, { height: topInset + 48, paddingTop: topInset }],
      ]}
    >
      <View style={styles.topBarSide}>
        {!isSelf ? (
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={[styles.iconButton, overlay && styles.overlayIconButton]}
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.topBarCenter} />

      <View style={[styles.topBarSide, styles.topBarRight]}>
        {!isSelf && romanceIcon && onRomancePress ? (
          <Pressable
            onPress={onRomancePress}
            disabled={romanceBusy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={romanceIcon.startsWith('infinite') ? 'Mutual Focus details' : 'Romantic connection details'}
            style={({ pressed }) => [
              styles.romanceTopButton,
              overlay && styles.overlayIconButton,
              pressed && styles.pressed,
            ]}
          >
            {romanceBusy ? (
              <ActivityIndicator size="small" color={theme.colors.text} />
            ) : (
              <Ionicons
                name={romanceIcon}
                size={19}
                color={romanceIcon.startsWith('infinite') ? '#6758C8' : '#C95A70'}
              />
            )}
          </Pressable>
        ) : null}

        {isSelf ? (
          <Pressable
            onPress={onManageSelf}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="More profile options"
            style={[styles.iconButton, overlay && styles.overlayIconButton]}
          >
            <Ionicons name="ellipsis-horizontal" size={23} color={theme.colors.text} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onManageProfile}
            hitSlop={10}
            style={[styles.iconButton, overlay && styles.overlayIconButton]}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function RomanticInterestCard({
  profile,
  status,
  busy,
  onInterestPress,
  onFocusPress,
}) {
  const { theme, styles } = useProfileTheme();
  const firstName = (profile?.display_name || 'them').trim().split(/\s+/)[0];
  const mutual = Boolean(status?.mutualRevealed);
  const selected = Boolean(status?.selectedByMe);
  const focusSelected = Boolean(status?.focusSelectedByMe);
  const focusActive = Boolean(status?.focusActive);

  const title = focusActive
    ? 'Focusing on each other'
    : mutual
      ? 'The interest is mutual'
      : selected
        ? 'Interest saved privately'
        : `Want to get to know ${firstName} better?`;

  const body = focusActive
    ? 'Romantic discovery with other connections is paused while you give this connection a real chance.'
    : mutual
      ? 'Keep getting to know each other. Focus is a separate private choice that becomes active only when you both choose it.'
      : selected
        ? 'Only you can see this unless they independently choose you too.'
        : 'This stays private unless they choose you too.';

  const focusLabel = focusActive
    ? 'End Focus'
    : focusSelected
      ? 'Focus selected privately'
      : 'Focus on this connection';

  return (
    <View style={[
      styles.romanticChannelCard,
      mutual && styles.romanticMutualCard,
      focusActive && styles.romanticFocusCard,
    ]}>
      <Pressable
        onPress={focusActive || focusSelected ? onFocusPress : onInterestPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={focusActive
          ? 'Double tap to review ending Focus.'
          : focusSelected
            ? 'Double tap to review removing your private Focus choice.'
          : mutual
            ? 'Double tap to review ending Mutual Interest.'
            : selected
              ? 'Double tap to remove your private interest.'
              : 'Double tap to privately choose this connection.'}
        style={({ pressed }) => [
          styles.romanticMainRow,
          pressed && styles.pressed,
        ]}
      >
        <View style={[
          styles.romanticChannelIcon,
          selected && styles.romanticSelectedIcon,
          focusActive && styles.romanticFocusIcon,
        ]}>
          {busy ? (
            <ActivityIndicator size="small" color={theme.colors.text} />
          ) : (
            <Ionicons
              name={focusActive ? 'infinite' : selected ? 'heart' : 'heart-outline'}
              size={20}
              color={theme.colors.text}
            />
          )}
        </View>
        <View style={styles.romanticChannelCopy}>
          <Text style={styles.romanticChannelTitle}>{title}</Text>
          <Text style={styles.romanticChannelBody}>{body}</Text>
        </View>
        <Ionicons
          name={selected ? 'checkmark' : 'chevron-forward'}
          size={18}
          color={theme.colors.subtext}
        />
      </Pressable>

      {mutual && status?.focusAvailable ? (
        <>
          <View style={styles.romanticCardSeparator} />
          <Pressable
            onPress={onFocusPress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={focusLabel}
            style={({ pressed }) => [
              styles.focusActionRow,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={focusActive ? 'pause-circle-outline' : focusSelected ? 'checkmark-circle' : 'radio-button-on-outline'}
              size={19}
              color={theme.colors.text}
            />
            <View style={styles.focusActionCopy}>
              <Text style={styles.focusActionTitle}>{focusLabel}</Text>
              {!focusActive ? (
                <Text style={styles.focusActionBody}>
                  {focusSelected
                    ? 'They are not notified unless they independently choose Focus too.'
                    : 'This remains private unless they make the same choice.'}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={17} color={theme.colors.subtext} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function EmptyPosts({ isSelf, canViewPosts, onCreatePost, decorated = false }) {
  const { theme, styles } = useProfileTheme();
  if (!canViewPosts) {
    return (
      <View style={[styles.emptyRoot, decorated && styles.decoratedSurface]}>
        <Ionicons name="lock-closed-outline" size={34} color={theme.colors.subtext} />
        <Text style={styles.emptyTitle}>Private posts</Text>
        <Text style={styles.emptyText}>
          Connect with this person to see what they share with their circles.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.emptyRoot, decorated && styles.decoratedSurface]}>
      <Ionicons
        name={isSelf ? 'images-outline' : 'camera-outline'}
        size={36}
        color={theme.colors.subtext}
      />
      <Text style={styles.emptyTitle}>
        {isSelf ? 'Share your first moment' : 'No posts yet'}
      </Text>
      <Text style={styles.emptyText}>
        {isSelf
          ? 'Your posts will appear here for the people in your circles.'
          : 'Their posts will appear here when they share something.'}
      </Text>

      {isSelf ? (
        <Pressable
          onPress={onCreatePost}
          style={({ pressed }) => [
            styles.emptyButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.emptyButtonText}>Create a post</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ProfileViewScreen({
  navigation,
  userId,
  sourceEventId = null,
  isSelf = false,
}) {
  const { theme, styles } = useProfileTheme();
  const insets = useSafeAreaInsets();
  const cacheKey = navigationCacheKeys.profilePage(userId || 'self');
  const cachedPage = readNavigationCache(cacheKey);
  const [profile, setProfile] = useState(cachedPage?.profile || null);
  const [posts, setPosts] = useState(cachedPage?.posts || []);
  const [loading, setLoading] = useState(!cachedPage?.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const initialLoadFinishedRef = useRef(false);
  const lastLoadedAtRef = useRef(cachedPage?.profile ? Date.now() : 0);
  const [actionBusy, setActionBusy] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const [managedPost, setManagedPost] = useState(null);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [mutualPreviewPostId, setMutualPreviewPostId] = useState(cachedPage?.mutualPreviewPostId || null);
  const [previewSaving, setPreviewSaving] = useState(false);
  const [socialStats, setSocialStats] = useState(cachedPage?.socialStats || null);
  const [romanticStatus, setRomanticStatus] = useState(cachedPage?.romanticStatus || {
    available: false,
    channelOpen: false,
    selectedByMe: false,
    mutualRevealed: false,
    focusAvailable: false,
    focusSelectedByMe: false,
    focusMutualRevealed: false,
    focusActive: false,
  });
  const [romanticBusy, setRomanticBusy] = useState(false);
  const [romanceSheetVisible, setRomanceSheetVisible] = useState(false);
  const [circleProposalBusy, setCircleProposalBusy] = useState(false);
  const [circleProposalStatus, setCircleProposalStatus] = useState(cachedPage?.circleProposalStatus || {
    available: false,
    state: 'unavailable',
    canPropose: false,
    accepted: false,
    focusActive: false,
    circleEnabled: false,
    existingCircle: false,
    reopening: false,
    circleLocked: false,
    circleAccessActive: false,
    conversationId: null,
  });
  const [whisperEligibility, setWhisperEligibility] = useState({
    canSend: false,
    reason: 'loading',
    nextAllowedAt: null,
  });
  const [whisperComposerVisible, setWhisperComposerVisible] = useState(false);

  const load = useCallback(async ({ refresh = false, quiet = false } = {}) => {
    if (refresh) setRefreshing(true);
    else if (!quiet) setLoading(true);

    setError('');

    try {
      const result = await fetchProfilePage(userId);

      // Identity, decoration and posts are the profile. Private preview and
      // romantic/proposal state are secondary controls. Paint the actual
      // profile as soon as its core payload arrives instead of making it wait
      // for several unrelated RPCs to finish.
      setProfile((current) => preserveProfileDecorationImageUrls(current, result.profile));
      setPosts(result.posts);
      setSocialStats(result.socialStats || null);
      setLoading(false);

      const isOwnProfile =
        isSelf || result.profile?.relationship_status === 'self';
      const connected = result.profile?.relationship_status === 'connected';
      const previewPromise = isOwnProfile
        ? fetchMyMutualPreviewPostId()
        : Promise.resolve(null);
      const romanticPromise = connected
        ? fetchRomanticInterestStatus(result.profile.id)
        : Promise.resolve({
            available: false,
            channelOpen: false,
            selectedByMe: false,
            mutualRevealed: false,
            focusAvailable: false,
            focusSelectedByMe: false,
            focusMutualRevealed: false,
            focusActive: false,
          });
      const proposalPromise = connected
        ? fetchTwoPersonCircleProposalStatus(result.profile.id)
        : Promise.resolve({
            available: false,
            state: 'unavailable',
            canPropose: false,
            accepted: false,
            focusActive: false,
            circleEnabled: false,
            existingCircle: false,
            reopening: false,
            circleLocked: false,
            circleAccessActive: false,
            conversationId: null,
          });
      const whisperPromise = connected
        ? getWhisperSendEligibility(result.profile.id).catch(() => ({
            canSend: false,
            reason: 'unavailable',
            nextAllowedAt: null,
          }))
        : Promise.resolve({
            canSend: false,
            reason: 'not_connected',
            nextAllowedAt: null,
          });

      const [previewPostId, romanticStatus, proposalStatus, whisperStatus] = await Promise.all([
        previewPromise,
        romanticPromise,
        proposalPromise,
        whisperPromise,
      ]);

      setMutualPreviewPostId(previewPostId);
      setRomanticStatus(romanticStatus);
      setCircleProposalStatus(proposalStatus);
      setWhisperEligibility(whisperStatus);
      writeNavigationCache(cacheKey, {
        profile: result.profile,
        posts: result.posts || [],
        socialStats: result.socialStats || null,
        mutualPreviewPostId: previewPostId,
        romanticStatus,
        circleProposalStatus: proposalStatus,
      });
    } catch (loadError) {
      setError(loadError?.message || 'Failed to load profile.');
    } finally {
      lastLoadedAtRef.current = Date.now();
      setLoading(false);
      setRefreshing(false);
    }
  }, [cacheKey, isSelf, userId]);

  useEffect(() => {
    let active = true;
    void load({ quiet: Boolean(cachedPage?.profile) }).finally(() => {
      if (active) initialLoadFinishedRef.current = true;
    });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!initialLoadFinishedRef.current) return;
      if (Date.now() - lastLoadedAtRef.current < 20_000) return;
      void load({ quiet: true });
    });

    return unsubscribe;
  }, [navigation, load]);

  const resolvedIsSelf = isSelf || profile?.relationship_status === 'self';
  const romanceAffordanceIcon = romanticStatus.focusActive || romanticStatus.focusSelectedByMe
    ? 'infinite'
    : romanticStatus.selectedByMe || romanticStatus.mutualRevealed
      ? 'heart'
      : 'heart-outline';

  const editManagedPost = () => {
    if (!managedPost?.id) return;

    const postId = managedPost.id;
    setManagedPost(null);
    navigation.navigate('EditPost', { postId });
  };

  const removeManagedPost = async () => {
    if (!managedPost?.id || deletingPostId) return;

    const postId = managedPost.id;
    setDeletingPostId(postId);

    try {
      await deleteOwnPost(postId);
      setPosts((currentPosts) =>
        currentPosts.filter((post) => post.id !== postId)
      );
      if (mutualPreviewPostId === postId) {
        setMutualPreviewPostId(null);
      }
      setProfile((currentProfile) =>
        currentProfile
          ? {
              ...currentProfile,
              post_count: Math.max(
                0,
                Number(currentProfile.post_count || 0) - 1
              ),
            }
          : currentProfile
      );
      setManagedPost(null);
    } catch (deleteError) {
      Alert.alert(
        'Post not deleted',
        deleteError?.message || 'Please try again.'
      );
    } finally {
      setDeletingPostId(null);
    }
  };

  const saveMutualPreview = async (nextPostId) => {
    if (previewSaving) return;

    setPreviewSaving(true);
    try {
      const savedPostId = await setMyMutualPreviewPost(nextPostId);
      setMutualPreviewPostId(savedPostId);
      setManagedPost(null);
    } catch (previewError) {
      Alert.alert(
        'Preview not updated',
        previewError?.message || 'Please try again.'
      );
    } finally {
      setPreviewSaving(false);
    }
  };

  const toggleManagedPostPreview = () => {
    if (!managedPost?.id || previewSaving) return;

    if (managedPost.id === mutualPreviewPostId) {
      saveMutualPreview(null);
      return;
    }

    Alert.alert(
      'Show this post to mutuals?',
      'People who share trusted contact context with you will be able to see this one preview before you connect. Your full profile and other posts stay private.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Show post',
          onPress: () => saveMutualPreview(managedPost.id),
        },
      ]
    );
  };

  const handleConnect = async () => {
    if (!profile?.id || actionBusy) return;

    setActionBusy(true);
    try {
      await sendProfileConnectionRequest(profile.id, sourceEventId);
      await load({ refresh: true });
    } catch (actionError) {
      Alert.alert(
        'Could not send request',
        actionError?.message || 'Please try again.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleRespond = async (action) => {
    if (!profile?.request_id || actionBusy) return;

    setActionBusy(true);
    try {
      await respondToProfileRequest(profile.request_id, action);
      await load({ refresh: true });
    } catch (actionError) {
      Alert.alert(
        'Could not update request',
        actionError?.message || 'Please try again.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const updateRomanticInterest = async (selected) => {
    if (!profile?.id || romanticBusy) return;

    setRomanticBusy(true);
    try {
      const nextStatus = await setMyRomanticInterest(profile.id, selected);
      setRomanticStatus(nextStatus);
    } catch (interestError) {
      Alert.alert(
        'Romantic interest not updated',
        interestError?.message || 'Please try again.'
      );
    } finally {
      setRomanticBusy(false);
    }
  };

  const handleRomanticInterest = () => {
    if (!profile?.id || romanticBusy || !romanticStatus.channelOpen) return;

    const firstName = (profile.display_name || 'this connection')
      .trim()
      .split(/\s+/)[0];

    if (romanticStatus.mutualRevealed) {
      Alert.alert(
        'End Mutual Interest?',
        'This resets both private selections and returns you to an ordinary connection. Your messages remain.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'End Mutual Interest',
            style: 'destructive',
            onPress: () => updateRomanticInterest(false),
          },
        ]
      );
      return;
    }

    if (romanticStatus.selectedByMe) {
      Alert.alert(
        'Remove your private interest?',
        'Removing this clears your selection and any active mutual state for this connection.',
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => updateRomanticInterest(false),
          },
        ]
      );
      return;
    }

    Alert.alert(
      `Want to get to know ${firstName} better?`,
      `This stays private unless ${firstName} chooses you too.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Choose ${firstName}`,
          onPress: () => updateRomanticInterest(true),
        },
      ]
    );
  };

  const updateRomanticFocus = async (selected) => {
    if (!profile?.id || romanticBusy) return;

    setRomanticBusy(true);
    try {
      const nextStatus = await setMyRomanticFocus(profile.id, selected);
      const nextProposalStatus = await fetchTwoPersonCircleProposalStatus(
        profile.id
      );
      setRomanticStatus(nextStatus);
      setCircleProposalStatus(nextProposalStatus);
    } catch (focusError) {
      Alert.alert(
        'Focus not updated',
        focusError?.message || 'Please try again.'
      );
    } finally {
      setRomanticBusy(false);
    }
  };

  const handleRomanticFocus = () => {
    if (!profile?.id || romanticBusy || !romanticStatus.mutualRevealed) return;

    const firstName = (profile.display_name || 'this connection')
      .trim()
      .split(/\s+/)[0];

    if (romanticStatus.focusActive) {
      Alert.alert(
        'End Mutual Focus?',
        circleProposalStatus.existingCircle
          ? 'This resets the romantic state and locks Our Circle while preserving its history. Your ordinary connection and messages remain. Romantic discovery with other connections stays paused until you resume it from Settings.'
          : 'This resets the romantic state between you and returns you to an ordinary connection. Your messages remain. Romantic discovery with other connections will stay paused until you resume it from Settings.',
        [
          { text: 'Keep focusing', style: 'cancel' },
          {
            text: 'End Focus',
            style: 'destructive',
            onPress: () => updateRomanticFocus(false),
          },
        ]
      );
      return;
    }

    if (romanticStatus.focusSelectedByMe) {
      Alert.alert(
        'Remove your private Focus choice?',
        'They have not been told about this choice. Removing it returns this connection to Mutual Interest.',
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => updateRomanticFocus(false),
          },
        ]
      );
      return;
    }

    Alert.alert(
      `Focus on ${firstName}?`,
      `This stays private unless ${firstName} independently chooses Focus too. If it becomes mutual, romantic discovery with other connections pauses for both of you.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: `Focus on ${firstName}`,
          onPress: () => updateRomanticFocus(true),
        },
      ]
    );
  };

  const submitCircleProposal = async () => {
    if (!profile?.id || circleProposalBusy) return;

    setCircleProposalBusy(true);
    try {
      const nextStatus = await proposeTwoPersonCircle(profile.id);
      setCircleProposalStatus(nextStatus);
    } catch (proposalError) {
      Alert.alert(
        'Circle proposal not sent',
        proposalError?.message || 'Please try again.'
      );
    } finally {
      setCircleProposalBusy(false);
    }
  };

  const handleCircleProposal = () => {
    if (!profile?.id || circleProposalBusy || !circleProposalStatus.canPropose) {
      return;
    }

    const firstName = (profile.display_name || 'this connection')
      .trim()
      .split(/\s+/)[0];

    const reopening = circleProposalStatus.existingCircle;

    Alert.alert(
      reopening
        ? `Open Our Circle again with ${firstName}?`
        : `Create a Circle with ${firstName}?`,
      reopening
        ? `${firstName} can choose Open Our Circle, Not yet, or End Focus. The preserved shared history stays locked unless they accept.`
        : `${firstName} can choose Create our Circle, Not yet, or End Focus. A Not yet response transfers the next proposal right to them, and Circles will not send reminders.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send proposal',
          onPress: submitCircleProposal,
        },
      ]
    );
  };

  const submitCircleProposalResponse = async (action) => {
    if (!profile?.id || circleProposalBusy) return;

    setCircleProposalBusy(true);
    try {
      const nextStatus = await respondToTwoPersonCircleProposal(
        profile.id,
        action
      );
      setCircleProposalStatus(nextStatus);

      if (action === 'end_focus') {
        const nextRomanticStatus = await fetchRomanticInterestStatus(profile.id);
        setRomanticStatus(nextRomanticStatus);
      }
    } catch (proposalError) {
      Alert.alert(
        'Circle proposal not updated',
        proposalError?.message || 'Please try again.'
      );
    } finally {
      setCircleProposalBusy(false);
    }
  };

  const handleAcceptCircleProposal = () => {
    const firstName = (profile?.display_name || 'this connection')
      .trim()
      .split(/\s+/)[0];

    const reopening = circleProposalStatus.existingCircle;

    Alert.alert(
      reopening ? 'Open Our Circle again?' : 'Create your Circle?',
      reopening
        ? `This unlocks the preserved shared Circle with ${firstName}. Messages and media exchanged while it was closed stay outside the Circle Timeline.`
        : `This creates a private two-person Circle with ${firstName}. Your existing direct messages remain intact, and old private chat media will not be added to the new Circle Timeline.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: reopening ? 'Open Our Circle' : 'Create our Circle',
          onPress: () => submitCircleProposalResponse('accept'),
        },
      ]
    );
  };

  const handleNotYetCircleProposal = () => {
    Alert.alert(
      'Choose Not yet?',
      'Mutual Focus stays active. The proposal will not repeat automatically, and only you will be able to make the next proposal.',
      [
        { text: 'Go back', style: 'cancel' },
        {
          text: 'Not yet',
          onPress: () => submitCircleProposalResponse('not_yet'),
        },
      ]
    );
  };

  const handleEndFocusFromProposal = () => {
    Alert.alert(
      'End Mutual Focus?',
      circleProposalStatus.existingCircle
        ? 'This declines the reopening proposal, resets the romantic state, and keeps Our Circle locked. Your ordinary connection and messages remain, while outside romantic discovery stays paused until each person resumes it.'
        : 'This declines the Circle proposal and resets the romantic state between you. Your ordinary connection and messages remain, while outside romantic discovery stays paused until each person resumes it.',
      [
        { text: 'Keep focusing', style: 'cancel' },
        {
          text: 'End Focus',
          style: 'destructive',
          onPress: () => submitCircleProposalResponse('end_focus'),
        },
      ]
    );
  };

  const handleRemoveConnection = () => {
    if (!profile?.id || actionBusy) return;

    const firstName = (profile.display_name || 'this person')
      .trim()
      .split(/\s+/)[0];
    const circleCopy = circleProposalStatus.existingCircle
      ? ' Your shared Circle will be locked and preserved. It will not reopen automatically if you connect again.'
      : '';

    Alert.alert(
      `Remove ${firstName} as a connection?`,
      `You will lose full-profile, Feed, and direct-message access.${circleCopy}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove connection',
          style: 'destructive',
          onPress: async () => {
            setActionBusy(true);
            try {
              await removeProfileConnection(profile.id);
              navigation.goBack();
            } catch (removeError) {
              Alert.alert(
                'Connection not removed',
                removeError?.message || 'Please try again.'
              );
            } finally {
              setActionBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleBlockAccount = () => {
    if (!profile?.id || actionBusy) return;

    const firstName = (profile.display_name || 'this account')
      .trim()
      .split(/\s+/)[0];
    const sharedCircleCopy = circleProposalStatus.existingCircle
      ? ' Any Our Circle will be locked and preserved.'
      : '';

    Alert.alert(
      `Block ${firstName}?`,
      `They will not be notified. Direct profile, connection, messaging, and romantic access will end.${sharedCircleCopy} Shared group Circles and factual event history are not erased.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setActionBusy(true);
            try {
              await blockUser(profile.id, 'profile');
              navigation.goBack();
            } catch (blockError) {
              Alert.alert(
                'Account not blocked',
                blockError?.message || 'Please try again.'
              );
            } finally {
              setActionBusy(false);
            }
          },
        },
      ]
    );
  };

  const openReportAccount = () => {
    if (!profile?.id) return;
    navigation.navigate('ReportUser', {
      userId: profile.id,
      displayName: profile.display_name || 'This account',
      sourceContext: 'profile',
    });
  };

  const handleManageSelf = () => {
    Alert.alert('Profile', 'Choose what you want to manage.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit profile', onPress: () => navigation.navigate('EditProfile') },
      { text: 'Customize profile', onPress: () => navigation.navigate('CustomizeProfile') },
      { text: 'Settings', onPress: () => navigation.navigate('AccountSettings') },
    ]);
  };

  const handleManageProfile = () => {
    if (!profile?.id || resolvedIsSelf) return;

    const connected = profile.relationship_status === 'connected';
    const title = profile.display_name || 'Manage account';

    if (connected) {
      Alert.alert(title, 'Choose an account or relationship action.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Report account', onPress: openReportAccount },
        {
          text: 'Connection options',
          onPress: () => {
            Alert.alert(title, 'Removing and blocking are different actions.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove connection', onPress: handleRemoveConnection },
              { text: 'Block account', style: 'destructive', onPress: handleBlockAccount },
            ]);
          },
        },
      ]);
      return;
    }

    Alert.alert(title, 'Choose a safety action.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report account', onPress: openReportAccount },
      { text: 'Block account', style: 'destructive', onPress: handleBlockAccount },
    ]);
  };

  const openTwoPersonCircle = () => {
    if (!circleProposalStatus.conversationId) return;

    navigation.navigate('MainTabs', {
      screen: 'Circles',
      params: {
        screen: 'CircleProfile',
        params: {
          conversationId: circleProposalStatus.conversationId,
        },
      },
    });
  };

  const openPosts = () => {
    if (posts.length > 0) {
      navigation.navigate('ProfilePostsFeed', {
        userId: profile?.id,
        profileName: profile?.display_name || 'Posts',
        initialPostId: posts[0].id,
      });
      return;
    }

    if (resolvedIsSelf) {
      navigation.navigate('CreatePost');
    }
  };

  const openEvents = () => {
    navigation.navigate('ProfileEvents', {
      userId: resolvedIsSelf ? null : profile?.id,
      profileName: profile?.display_name || 'Profile',
    });
  };

  const openConnections = () => {
    navigation.navigate('ProfileConnections', {
      userId: resolvedIsSelf ? null : profile?.id,
      profileName: profile?.display_name || 'Profile',
    });
  };

  const openWhisperComposer = () => {
    if (!profile?.id || profile.relationship_status !== 'connected') return;

    if (whisperEligibility.canSend) {
      setWhisperComposerVisible(true);
      return;
    }

    if (whisperEligibility.reason === 'cooldown') {
      Alert.alert(
        'Whisper already floating',
        'You can Whisper this connection once every 24 hours.'
      );
      return;
    }

    if (whisperEligibility.reason === 'disabled') return;

    Alert.alert('Whisper unavailable', 'You cannot send a Whisper to this connection right now.');
  };

  const submitWhisper = async (body) => {
    if (!profile?.id) return;
    const result = await sendWhisper(profile.id, body);
    setWhisperEligibility({
      canSend: false,
      reason: 'cooldown',
      nextAllowedAt: result.nextAllowedAt || null,
    });
  };

  const decorationActive = Boolean(
    profile?.profile_header_url
    || profile?.profile_background_url
    || profile?.profile_background_color
    || profile?.profile_stickers?.length
  );

  const hasHeaderPhoto = Boolean(profile?.profile_header_url);

  const profileHeaderNode = profile ? (
    <ProfileHeader
      profile={profile}
      isSelf={resolvedIsSelf}
      showStats={Boolean(profile.can_view_posts)}
      busy={actionBusy}
      onConnect={handleConnect}
      onAccept={() => handleRespond('accept')}
      onDecline={() => handleRespond('decline')}
      stats={socialStats}
      onPostsPress={openPosts}
      onEventsPress={openEvents}
      onConnectionsPress={openConnections}
      onWhisperPress={openWhisperComposer}
      whisperVisible={profile.relationship_status === 'connected' && (whisperEligibility.canSend || whisperEligibility.reason === 'cooldown')}
      whisperReady={Boolean(whisperEligibility.canSend)}
      topInset={hasHeaderPhoto ? insets.top : 0}
    />
  ) : null;

  const header = profile ? (
    <>
      {hasHeaderPhoto ? (
        <View style={styles.profileHeaderStack}>
          {profileHeaderNode}
          <TopBar
            isSelf={resolvedIsSelf}
            navigation={navigation}
            onManageSelf={handleManageSelf}
            onManageProfile={handleManageProfile}
            romanceIcon={!resolvedIsSelf && profile.relationship_status === 'connected' && romanticStatus.channelOpen ? romanceAffordanceIcon : null}
            onRomancePress={() => setRomanceSheetVisible(true)}
            romanceBusy={romanticBusy || circleProposalBusy}
            overlay
            topInset={insets.top}
            decorated={decorationActive}
          />
        </View>
      ) : (
        <>
          <TopBar
            isSelf={resolvedIsSelf}
            navigation={navigation}
            onManageSelf={handleManageSelf}
            onManageProfile={handleManageProfile}
            romanceIcon={!resolvedIsSelf && profile.relationship_status === 'connected' && romanticStatus.channelOpen ? romanceAffordanceIcon : null}
            onRomancePress={() => setRomanceSheetVisible(true)}
            romanceBusy={romanticBusy || circleProposalBusy}
            decorated={decorationActive}
          />
          {profileHeaderNode}
        </>
      )}

      {!profile.can_view_posts ? (
        <PreConnectionProfileShell profile={profile} />
      ) : null}
    </>
  ) : null;

  if (loading && !profile) {
    return (
      <SafeAreaView edges={['top']} style={styles.centeredRoot}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </SafeAreaView>
    );
  }

  if (error && !profile) {
    return (
      <SafeAreaView edges={['top']} style={styles.centeredRoot}>
        {!isSelf ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.errorBack}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </Pressable>
        ) : null}
        <Ionicons name="alert-circle-outline" size={38} color={theme.colors.subtext} />
        <Text style={styles.emptyTitle}>Profile unavailable</Text>
        <Text style={styles.emptyText}>{error}</Text>
        <Pressable
          onPress={() => load()}
          style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
        >
          <Text style={styles.emptyButtonText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const profileBody = (
    <SafeAreaView
      edges={hasHeaderPhoto ? [] : ['top']}
      style={[styles.screen, decorationActive && styles.decoratedScreen]}
    >
      <StickerCanvas stickers={profile?.profile_stickers} customStickers={profile?.profile_custom_stickers} style={styles.stickerLayer} />
      <View
        style={[
          styles.contentWidth,
          decorationActive && styles.decoratedContentWidth,
        ]}
        onLayout={(event) => {
          const nextWidth = Math.floor(event.nativeEvent.layout.width);
          setGridWidth((currentWidth) =>
            currentWidth === nextWidth ? currentWidth : nextWidth
          );
        }}
      >
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <ProfilePostGridItem
              post={item}
              isMutualPreview={item.id === mutualPreviewPostId}
              size={gridWidth > 0 ? Math.floor(gridWidth / 3) : undefined}
              onPress={() => navigation.navigate('ProfilePostsFeed', {
                userId: profile?.id,
                profileName: profile?.display_name || 'Posts',
                initialPostId: item.id,
              })}
            />
          )}
          ListEmptyComponent={profile?.can_view_posts ? (
            <EmptyPosts
              isSelf={resolvedIsSelf}
              canViewPosts
              onCreatePost={() => navigation.navigate('CreatePost')}
              decorated={decorationActive}
            />
          ) : null}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ refresh: true })}
              tintColor={theme.colors.text}
            />
          )}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
        />

        <RomanceProfileSheet
          visible={romanceSheetVisible}
          profile={profile}
          romanticStatus={romanticStatus}
          proposalStatus={circleProposalStatus}
          busy={romanticBusy || circleProposalBusy}
          onClose={() => setRomanceSheetVisible(false)}
          onInterestPress={handleRomanticInterest}
          onFocusPress={handleRomanticFocus}
          onPropose={handleCircleProposal}
          onAccept={handleAcceptCircleProposal}
          onNotYet={handleNotYetCircleProposal}
          onEndFocus={handleEndFocusFromProposal}
          onOpenCircle={openTwoPersonCircle}
        />

        <WhisperComposerSheet
          visible={whisperComposerVisible}
          profile={profile}
          onClose={() => setWhisperComposerVisible(false)}
          onSend={submitWhisper}
        />

        <PostOwnerMenu
          visible={Boolean(managedPost)}
          busy={Boolean(deletingPostId)}
          previewBusy={previewSaving}
          isMutualPreview={managedPost?.id === mutualPreviewPostId}
          onClose={() => {
            if (!deletingPostId && !previewSaving) setManagedPost(null);
          }}
          onToggleMutualPreview={toggleManagedPostPreview}
          onEdit={editManagedPost}
          onDelete={removeManagedPost}
        />
      </View>
    </SafeAreaView>
  );

  if (profile?.profile_background_url) {
    return (
      <ImageBackground
        source={{ uri: profile.profile_background_url }}
        resizeMode="cover"
        style={styles.backgroundImage}
      >
        <View style={styles.backgroundImageTint} />
        {profileBody}
      </ImageBackground>
    );
  }

  if (profile?.profile_background_color) {
    return (
      <View style={[styles.backgroundImage, { backgroundColor: profile.profile_background_color }]}>
        {profileBody}
      </View>
    );
  }

  return profileBody;
}

function createStyles(theme) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  decoratedScreen: {
    backgroundColor: 'transparent',
  },
  backgroundImage: {
    flex: 1,
  },
  backgroundImageTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  stickerLayer: {
    zIndex: 0,
  },
  contentWidth: {
    flex: 1,
    width: '100%',
    zIndex: 1,
    maxWidth: 720,
    alignSelf: 'center',
    borderLeftWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
    borderRightWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.border,
  },
  decoratedContentWidth: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  decoratedSurface: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.72)',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 42,
  },
  gridRow: {
    alignItems: 'flex-start',
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  decoratedTopBar: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderBottomColor: 'rgba(255,255,255,0.78)',
  },
  topBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    minHeight: 0,
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
  },
  profileHeaderStack: {
    position: 'relative',
  },
  topBarSide: {
    width: 46,
    alignItems: 'flex-start',
  },
  topBarRight: {
    width: 'auto',
    minWidth: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  romanceTopButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.46)',
  },
  topBarCenter: {
    flex: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayIconButton: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#0A1222',
    shadowOpacity: 0.12,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  romanticChannelCard: {
    marginHorizontal: 18,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSoft,
    overflow: 'hidden',
  },
  romanticMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  romanticMutualCard: {
    backgroundColor: '#fff7f8',
  },
  romanticFocusCard: {
    backgroundColor: '#f7f4ff',
  },
  romanticChannelIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  romanticSelectedIcon: {
    backgroundColor: '#ffe8ec',
  },
  romanticFocusIcon: {
    backgroundColor: '#ece7ff',
  },
  romanticChannelCopy: {
    flex: 1,
    marginLeft: 11,
  },
  romanticChannelTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13.5,
  },
  romanticChannelBody: {
    marginTop: 3,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 17,
  },
  romanticCardSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginLeft: 63,
  },
  focusActionRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  focusActionCopy: {
    flex: 1,
    marginLeft: 10,
  },
  focusActionTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12.5,
  },
  focusActionBody: {
    marginTop: 2,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10.5,
    lineHeight: 15,
  },
  centeredRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 28,
  },
  loadingText: {
    marginTop: 10,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  errorBack: {
    position: 'absolute',
    top: 8,
    left: 10,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRoot: {
    minHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingVertical: 34,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    marginTop: 12,
    textAlign: 'center',
  },
  emptyText: {
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 7,
    maxWidth: 360,
  },
  emptyButton: {
    minHeight: 42,
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: theme.circle.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    color: theme.colors.onPrimary,
    fontFamily: 'Manrope_700Bold',
  },
  pressed: {
    opacity: 0.72,
  },
  });
}
