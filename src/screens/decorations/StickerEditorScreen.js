import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { Avatar } from '../../components/Avatar';
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { ProfilePostGridItem } from '../../components/profile/ProfilePostGridItem';
import {
  EMOJI_DECALS,
  MAX_CUSTOM_STICKER_ASSETS,
  MAX_DECORATION_STICKERS,
  MAX_EMOJI_DECORATION_LENGTH,
  MAX_TEXT_DECORATION_LENGTH,
  STICKER_BASE_SIZE,
  TEXT_DECORATION_COLORS,
  TEXT_DECORATION_STYLES,
  StickerArt,
  getDecorationRenderBox,
  getSafeDecorationPosition,
  makeDecorationInstance,
  makeStickerInstance,
  normalizeCustomStickerAssets,
  normalizeStickerList,
} from '../../components/decorations/StickerCanvas';
import {
  fetchMyProfileDecoration,
  saveMyProfileStickerState,
} from '../../services/profileDecorationService';
import { fetchProfilePage } from '../../services/profileService';
import {
  fetchCircleDecoration,
  saveCircleStickerState,
} from '../../services/circleDecorationService';
import { getConversationDetails } from '../../services/conversationService';
import { listCirclePosts } from '../../services/circlePostService';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';

const PACKS = ['Emoji', 'Text', 'Yours'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(255,255,255,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

async function requestPhotoPermission() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return true;

  Alert.alert(
    'Photo access needed',
    'Allow photo access to add your own sticker images.'
  );
  return false;
}

function EditorSticker({
  sticker,
  customUrl,
  selected,
  floating = false,
  canvasSize,
  onSelect,
  onMove,
  onBeginDrag,
  onGuideChange,
}) {
  const startRef = useRef({ x: sticker.x, y: sticker.y });
  const positionRef = useRef({ x: sticker.x, y: sticker.y });
  const hasStartedDragRef = useRef(false);
  positionRef.current = { x: sticker.x, y: sticker.y };
  const box = getDecorationRenderBox(sticker, STICKER_BASE_SIZE);
  const safePosition = getSafeDecorationPosition(sticker, canvasSize, sticker.x, sticker.y, STICKER_BASE_SIZE);

  const clearGuides = () => onGuideChange?.({ vertical: false, horizontal: false });

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      startRef.current = positionRef.current;
      hasStartedDragRef.current = false;
      clearGuides();
      onSelect(sticker.id);
    },
    onPanResponderMove: (_, gesture) => {
      if (!canvasSize.width || !canvasSize.height) return;
      if (!hasStartedDragRef.current && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2)) {
        hasStartedDragRef.current = true;
        onBeginDrag?.(sticker.id);
      }

      const rawX = startRef.current.x + (gesture.dx / canvasSize.width);
      const rawY = startRef.current.y + (gesture.dy / canvasSize.height);
      let next = getSafeDecorationPosition(sticker, canvasSize, rawX, rawY, STICKER_BASE_SIZE);
      const snapX = 13 / canvasSize.width;
      const snapY = 13 / canvasSize.height;
      const vertical = Math.abs(next.x - 0.5) <= snapX;
      const horizontal = Math.abs(next.y - 0.5) <= snapY;

      if (vertical || horizontal) {
        next = getSafeDecorationPosition(
          sticker,
          canvasSize,
          vertical ? 0.5 : next.x,
          horizontal ? 0.5 : next.y,
          STICKER_BASE_SIZE
        );
      }

      onGuideChange?.({ vertical, horizontal });
      onMove(sticker.id, next);
    },
    onPanResponderRelease: clearGuides,
    onPanResponderTerminate: clearGuides,
  }), [box.height, box.width, canvasSize.height, canvasSize.width, onBeginDrag, onGuideChange, onMove, onSelect, sticker.id, sticker.rotation, sticker.scale]);

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.editorSticker,
        {
          width: box.width,
          height: box.height,
          left: (canvasSize.width * safePosition.x) - (box.width / 2),
          top: (canvasSize.height * safePosition.y) - (box.height / 2),
          zIndex: 10 + sticker.z,
          transform: [{ rotate: `${sticker.rotation}deg` }],
        },
        selected && styles.editorStickerSelected,
        floating && styles.editorStickerFloating,
      ]}
    >
      <StickerArt
        stickerId={sticker.sticker}
        kind={sticker.kind}
        content={sticker.content}
        textStyle={sticker.text_style}
        color={sticker.color}
        customUrl={customUrl}
        size={box.height}
        width={box.width}
        height={box.height}
      />
      {selected ? <View pointerEvents="none" style={styles.selectionRing} /> : null}
    </View>
  );
}

function PreviewTopControl({ side = 'right', icon, insets, theme }) {
  return (
    <View
      style={[
        styles.previewTopControl,
        side === 'left' ? styles.previewTopControlLeft : styles.previewTopControlRight,
        { top: insets.top + 5 },
      ]}
    >
      <Ionicons name={icon} size={21} color={theme.colors.text} />
    </View>
  );
}

function PersonalLivePreview({ preview, insets, width, theme }) {
  const profile = preview?.profile;
  if (!profile) return null;

  const hasHeader = Boolean(profile.profile_header_url);
  const posts = preview?.posts || [];
  const gridSize = Math.floor(width / 3);

  return (
    <View pointerEvents="none" style={styles.livePreviewLayer}>
      {!hasHeader ? <View style={{ height: insets.top + 48 }} /> : null}
      <ProfileHeader
        profile={profile}
        isSelf
        showStats
        stats={preview?.socialStats}
        topInset={hasHeader ? insets.top : 0}
      />
      <PreviewTopControl side="right" icon="ellipsis-horizontal" insets={insets} theme={theme} />
      <View style={styles.profilePreviewGrid}>
        {posts.slice(0, 9).map((post) => (
          <ProfilePostGridItem
            key={post.id}
            post={post}
            size={gridSize}
            onPress={() => {}}
          />
        ))}
      </View>
    </View>
  );
}

function CircleStat({ value, label, theme }) {
  return (
    <View style={styles.circlePreviewStat}>
      <Text style={[styles.circlePreviewStatValue, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.circlePreviewStatLabel, { color: theme.colors.subtext }]}>{label}</Text>
    </View>
  );
}

function CircleLivePreview({ preview, decoration, insets, width, theme }) {
  const conversation = preview?.details?.conversation;
  const members = preview?.details?.members || [];
  const posts = preview?.posts || [];
  if (!conversation) return null;

  const isTwoPerson = conversation.kind === 'direct';
  const hasHeader = Boolean(decoration?.circle_header_url);
  const slot = Math.floor(width / 3);
  const postSize = Math.max(72, slot - 14);

  return (
    <View pointerEvents="none" style={styles.livePreviewLayer}>
      <View
        style={[
          styles.circlePreviewHeader,
          { backgroundColor: rgba(theme.circle.accentSoft, 0.76) },
        ]}
      >
        {hasHeader ? (
          <View style={[styles.circlePreviewHeaderImageWrap, { height: 108 + insets.top }]}>
            <Image source={{ uri: decoration.circle_header_url }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
            <View style={styles.circlePreviewHeaderImageTint} />
          </View>
        ) : (
          <View style={{ height: insets.top + 42 }} />
        )}

        <View style={styles.circlePreviewAvatar}>
          <Avatar size={84} name={conversation.title || 'Circle'} uri={conversation.avatar_url} />
        </View>
        <Text style={[styles.circlePreviewTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {conversation.title || (isTwoPerson ? 'Our Circle' : 'Circle')}
        </Text>
        {conversation.bio && !isTwoPerson ? (
          <Text style={[styles.circlePreviewBio, { color: theme.colors.text }]} numberOfLines={2}>
            {conversation.bio}
          </Text>
        ) : null}

        <View style={styles.circlePreviewStats}>
          <CircleStat value={Number(conversation.post_count || posts.length)} label="Posts" theme={theme} />
          {isTwoPerson ? <CircleStat value="0" label="Plans" theme={theme} /> : null}
          {isTwoPerson ? <CircleStat value="0" label="Dates" theme={theme} /> : null}
          {isTwoPerson ? <CircleStat value="0" label="Albums" theme={theme} /> : null}
          <CircleStat value={Number(conversation.timeline_count || 0)} label="Timeline" theme={theme} />
          {!isTwoPerson ? <CircleStat value={members.length} label="People" theme={theme} /> : null}
        </View>

        <View style={styles.circlePreviewActions}>
          <View style={[styles.circlePreviewAction, { backgroundColor: theme.circle.accent }]}>
            <Ionicons name="add" size={16} color={theme.welcome.brandInk} />
            <Text style={[styles.circlePreviewActionText, { color: theme.welcome.brandInk }]}>New Post</Text>
          </View>
          {!isTwoPerson ? (
            <View style={styles.circlePreviewSecondaryAction}>
              <Ionicons name="calendar-outline" size={15} color={theme.colors.text} />
              <Text style={[styles.circlePreviewActionText, { color: theme.colors.text }]}>Plans</Text>
            </View>
          ) : null}
          <View style={styles.circlePreviewSecondaryAction}>
            <Ionicons name="ellipsis-horizontal" size={16} color={theme.colors.text} />
            <Text style={[styles.circlePreviewActionText, { color: theme.colors.text }]}>More</Text>
          </View>
        </View>
      </View>

      <PreviewTopControl side="left" icon="chevron-back" insets={insets} theme={theme} />

      {!isTwoPerson && members.length ? (
        <View style={styles.circlePreviewPeople}>
          <Text style={[styles.circlePreviewPeopleTitle, { color: theme.colors.text }]}>People</Text>
          <View style={styles.circlePreviewPeopleRow}>
            {members.slice(0, 5).map((member) => (
              <View key={member.user_id} style={styles.circlePreviewPerson}>
                <Avatar size={44} name={member.display_name || 'Member'} uri={member.avatar_url} />
                <Text style={[styles.circlePreviewPersonName, { color: theme.colors.text }]} numberOfLines={1}>
                  {member.is_me ? 'You' : member.display_name || 'Member'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.circlePreviewTabs}>
        <View style={styles.circlePreviewTab}>
          <Ionicons name="grid-outline" size={18} color={theme.colors.text} />
          <Text style={[styles.circlePreviewTabText, { color: theme.colors.text }]}>Posts</Text>
        </View>
        <View style={styles.circlePreviewTab}>
          <Ionicons name="time-outline" size={18} color={theme.colors.subtext} />
          <Text style={[styles.circlePreviewTabText, { color: theme.colors.subtext }]}>Timeline</Text>
        </View>
      </View>

      <View style={styles.circlePreviewGrid}>
        {posts.slice(0, 9).map((post) => {
          const first = post.media?.[0];
          return (
            <View key={post.id} style={[styles.circlePreviewPostSlot, { width: slot, height: slot }]}>
              <View style={[styles.circlePreviewPost, { width: postSize, height: postSize, borderRadius: postSize / 2, borderColor: theme.circle.accentSoft }]}>
                {first?.mediaType === 'image' ? (
                  <Image source={{ uri: first.url }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
                ) : (
                  <Ionicons name={first ? 'play' : 'image-outline'} size={27} color={theme.colors.subtext} />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StickerEditorContent({ route, navigation, forcedMode }) {
  const mode = forcedMode || route.params?.mode || 'profile';
  const conversationId = route.params?.conversationId || null;
  const theme = useThemeTokens();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const themedStyles = useMemo(() => createThemedStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('');
  const [error, setError] = useState('');
  const [stickers, setStickers] = useState([]);
  const [customStickers, setCustomStickers] = useState([]);
  const [existingCustomStickers, setExistingCustomStickers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [floatingSpawnIds, setFloatingSpawnIds] = useState(() => new Set());
  const [activePack, setActivePack] = useState('Emoji');
  const [emojiInput, setEmojiInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [textStyle, setTextStyle] = useState('glass');
  const [textColor, setTextColor] = useState('#0A1222');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [background, setBackground] = useState({ uri: null, color: null });
  const [preview, setPreview] = useState(null);
  const [decoration, setDecoration] = useState(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [alignmentGuides, setAlignmentGuides] = useState({ vertical: false, horizontal: false });
  const [, setHistoryVersion] = useState(0);
  const historyRef = useRef({ undo: [], redo: [] });
  const stickersRef = useRef(stickers);
  const customStickersRef = useRef(customStickers);
  stickersRef.current = stickers;
  customStickersRef.current = customStickers;

  const cloneEditorSnapshot = useCallback(() => ({
    stickers: stickersRef.current.map((item) => ({ ...item })),
    customStickers: customStickersRef.current.map((item) => ({ ...item })),
  }), []);

  const refreshHistoryControls = useCallback(() => {
    setHistoryVersion((value) => value + 1);
  }, []);

  const resetHistory = useCallback(() => {
    historyRef.current = { undo: [], redo: [] };
    refreshHistoryControls();
  }, [refreshHistoryControls]);

  const recordHistory = useCallback(() => {
    const nextUndo = [...historyRef.current.undo, cloneEditorSnapshot()].slice(-40);
    historyRef.current = { undo: nextUndo, redo: [] };
    refreshHistoryControls();
  }, [cloneEditorSnapshot, refreshHistoryControls]);

  const applyEditorSnapshot = useCallback((snapshot) => {
    const nextStickers = (snapshot?.stickers || []).map((item) => ({ ...item }));
    const nextCustom = (snapshot?.customStickers || []).map((item) => ({ ...item }));
    stickersRef.current = nextStickers;
    customStickersRef.current = nextCustom;
    setStickers(nextStickers);
    setCustomStickers(nextCustom);
    setFloatingSpawnIds(new Set());
    setAlignmentGuides({ vertical: false, horizontal: false });
    setSelectedId((current) => nextStickers.some((item) => item.id === current) ? current : null);
  }, []);

  const undo = useCallback(() => {
    const undoStack = historyRef.current.undo;
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    const current = cloneEditorSnapshot();
    historyRef.current = {
      undo: undoStack.slice(0, -1),
      redo: [...historyRef.current.redo, current].slice(-40),
    };
    applyEditorSnapshot(previous);
    refreshHistoryControls();
  }, [applyEditorSnapshot, cloneEditorSnapshot, refreshHistoryControls]);

  const redo = useCallback(() => {
    const redoStack = historyRef.current.redo;
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    const current = cloneEditorSnapshot();
    historyRef.current = {
      undo: [...historyRef.current.undo, current].slice(-40),
      redo: redoStack.slice(0, -1),
    };
    applyEditorSnapshot(next);
    refreshHistoryControls();
  }, [applyEditorSnapshot, cloneEditorSnapshot, refreshHistoryControls]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(Math.max(0, event?.endCoordinates?.height || 0));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setFloatingSpawnIds(new Set());
    setAlignmentGuides({ vertical: false, horizontal: false });
    resetHistory();
    try {
      if (mode === 'circle') {
        if (!conversationId) throw new Error('Circle not found.');
        const [details, decorationRows, postRows] = await Promise.all([
          getConversationDetails(conversationId),
          fetchCircleDecoration(conversationId),
          listCirclePosts(conversationId),
        ]);
        if (!decorationRows.canCustomize) {
          throw new Error('You do not have permission to decorate this Circle.');
        }
        const assets = normalizeCustomStickerAssets(decorationRows.circle_custom_stickers);
        setDecoration(decorationRows);
        setPreview({ details, posts: postRows });
        setBackground({
          uri: decorationRows.circle_background_url || null,
          color: decorationRows.circle_background_color || theme.circle.profileBackground,
        });
        setCustomStickers(assets);
        setExistingCustomStickers(assets);
        setStickers(normalizeStickerList(decorationRows.circle_stickers, assets));
      } else {
        const ownDecoration = await fetchMyProfileDecoration();
        const page = await fetchProfilePage(ownDecoration.id);
        const assets = normalizeCustomStickerAssets(ownDecoration.profile_custom_stickers);
        setDecoration(ownDecoration);
        setPreview(page);
        setBackground({
          uri: ownDecoration.profile_background_url || null,
          color: ownDecoration.profile_background_color || theme.colors.bg,
        });
        setCustomStickers(assets);
        setExistingCustomStickers(assets);
        setStickers(normalizeStickerList(ownDecoration.profile_stickers, assets));
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not load stickers.');
    } finally {
      setLoading(false);
    }
  }, [conversationId, mode, resetHistory, theme.circle.profileBackground, theme.colors.bg]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const customMap = useMemo(
    () => Object.fromEntries(customStickers.map((item) => [item.id, item])),
    [customStickers]
  );
  const selected = stickers.find((item) => item.id === selectedId) || null;
  const canUndo = historyRef.current.undo.length > 0;
  const canRedo = historyRef.current.redo.length > 0;

  const updateSticker = useCallback((id, patch) => {
    setStickers((current) => {
      const next = current.map((item) => item.id === id ? { ...item, ...patch } : item);
      stickersRef.current = next;
      return next;
    });
  }, []);

  const appendSticker = (next, { record = true } = {}) => {
    if (record) recordHistory();
    next.z = stickers.reduce((max, item) => Math.max(max, item.z), -1) + 1;
    setStickers((current) => {
      const updated = [...current, next];
      stickersRef.current = updated;
      return updated;
    });
    setFloatingSpawnIds((current) => {
      const nextIds = new Set(current);
      nextIds.add(next.id);
      return nextIds;
    });
    setSelectedId(next.id);
  };

  const settleSpawnedSticker = useCallback((id) => {
    setFloatingSpawnIds((current) => {
      if (!current.has(id)) return current;
      const nextIds = new Set(current);
      nextIds.delete(id);
      return nextIds;
    });
  }, []);

  const beginStickerDrag = useCallback((id) => {
    recordHistory();
    settleSpawnedSticker(id);
  }, [recordHistory, settleSpawnedSticker]);

  const addSticker = (stickerId, assetId = null) => {
    if (stickers.length >= MAX_DECORATION_STICKERS) {
      Alert.alert('Decoration limit reached', `You can place up to ${MAX_DECORATION_STICKERS} decorations in this space.`);
      return;
    }
    appendSticker(makeStickerInstance(stickerId, stickers.length, assetId));
  };

  const addEmoji = (value) => {
    const content = String(value || '').trim().slice(0, MAX_EMOJI_DECORATION_LENGTH);
    if (!content) return;
    if (stickers.length >= MAX_DECORATION_STICKERS) {
      Alert.alert('Decoration limit reached', `You can place up to ${MAX_DECORATION_STICKERS} decorations in this space.`);
      return;
    }
    appendSticker(makeDecorationInstance({ kind: 'emoji', content }, stickers.length));
    setEmojiInput('');
  };

  const addText = () => {
    const content = String(textInput || '').trim().slice(0, MAX_TEXT_DECORATION_LENGTH);
    if (!content) {
      Alert.alert('Add some text', 'Type a short phrase first.');
      return;
    }
    if (stickers.length >= MAX_DECORATION_STICKERS) {
      Alert.alert('Decoration limit reached', `You can place up to ${MAX_DECORATION_STICKERS} decorations in this space.`);
      return;
    }
    appendSticker(makeDecorationInstance({
      kind: 'text',
      content,
      textStyle,
      color: textColor,
    }, stickers.length));
    setTextInput('');
  };

  const pickCustomSticker = async () => {
    if (customStickers.length >= MAX_CUSTOM_STICKER_ASSETS) {
      Alert.alert('Upload library full', `You can keep up to ${MAX_CUSTOM_STICKER_ASSETS} custom sticker images in this space.`);
      return;
    }
    if (!(await requestPhotoPermission())) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    if (asset.fileSize && asset.fileSize > 9_500_000) {
      Alert.alert('Sticker image is too large', 'Choose an image under about 9.5 MB. Transparent PNG or WebP works best.');
      return;
    }

    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const custom = {
      id,
      path: null,
      localUri: asset.uri,
      url: asset.uri,
      mimeType: asset.mimeType || 'image/png',
    };
    recordHistory();
    setCustomStickers((current) => {
      const next = [...current, custom];
      customStickersRef.current = next;
      return next;
    });
    setActivePack('Yours');
    if (stickers.length < MAX_DECORATION_STICKERS) {
      appendSticker(makeStickerInstance('custom', stickers.length, id), { record: false });
    }
  };

  const removeCustomAsset = (asset) => {
    const usageCount = stickers.filter((item) => (item.kind === 'custom_image' || item.kind === 'apple_glyph' || item.sticker === 'custom') && item.asset_id === asset.id).length;
    const perform = () => {
      recordHistory();
      const selectedUsesAsset = (selected?.kind === 'custom_image' || selected?.kind === 'apple_glyph' || selected?.sticker === 'custom') && selected?.asset_id === asset.id;
      setCustomStickers((current) => {
        const next = current.filter((item) => item.id !== asset.id);
        customStickersRef.current = next;
        return next;
      });
      const removedIds = stickers.filter((item) => item.asset_id === asset.id).map((item) => item.id);
      setStickers((current) => {
        const next = current.filter((item) => item.asset_id !== asset.id);
        stickersRef.current = next;
        return next;
      });
      setFloatingSpawnIds((current) => {
        if (!removedIds.some((id) => current.has(id))) return current;
        const nextIds = new Set(current);
        removedIds.forEach((id) => nextIds.delete(id));
        return nextIds;
      });
      if (selectedUsesAsset) setSelectedId(null);
    };

    if (!usageCount) {
      perform();
      return;
    }

    Alert.alert(
      'Remove uploaded sticker?',
      `This also removes ${usageCount === 1 ? 'the copy using it' : `all ${usageCount} copies using it`} from the canvas.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: perform },
      ]
    );
  };

  const deleteSelected = () => {
    if (!selected) return;
    recordHistory();
    const id = selected.id;
    setStickers((current) => {
      const next = current.filter((item) => item.id !== id);
      stickersRef.current = next;
      return next;
    });
    setFloatingSpawnIds((current) => {
      if (!current.has(id)) return current;
      const nextIds = new Set(current);
      nextIds.delete(id);
      return nextIds;
    });
    setSelectedId(null);
  };

  const scaleSelected = (delta) => {
    if (!selected) return;
    recordHistory();
    const nextScale = clamp(selected.scale + delta, 0.55, 2.2);
    const nextSticker = { ...selected, scale: nextScale };
    const safe = getSafeDecorationPosition(nextSticker, canvasSize, selected.x, selected.y, STICKER_BASE_SIZE);
    updateSticker(selected.id, { scale: nextScale, ...safe });
  };

  const rotateSelected = (delta) => {
    if (!selected) return;
    recordHistory();
    let next = selected.rotation + delta;
    if (next > 180) next -= 360;
    if (next < -180) next += 360;
    const nextSticker = { ...selected, rotation: next };
    const safe = getSafeDecorationPosition(nextSticker, canvasSize, selected.x, selected.y, STICKER_BASE_SIZE);
    updateSticker(selected.id, { rotation: next, ...safe });
  };

  const moveLayer = (direction) => {
    if (!selected) return;
    const ordered = [...stickers].sort((a, b) => a.z - b.z);
    const index = ordered.findIndex((item) => item.id === selected.id);
    const swapIndex = direction === 'front'
      ? Math.min(ordered.length - 1, index + 1)
      : Math.max(0, index - 1);
    if (swapIndex === index) return;
    recordHistory();
    const other = ordered[swapIndex];
    setStickers((current) => {
      const next = current.map((item) => {
        if (item.id === selected.id) return { ...item, z: other.z };
        if (item.id === other.id) return { ...item, z: selected.z };
        return item;
      });
      stickersRef.current = next;
      return next;
    });
  };

  const clearAll = () => {
    if (!stickers.length) return;
    Alert.alert('Remove all placed decorations?', 'Your uploaded image library, header, and background will stay unchanged.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove all', style: 'destructive', onPress: () => {
        recordHistory();
        stickersRef.current = [];
        setStickers([]);
        setSelectedId(null);
        setFloatingSpawnIds(new Set());
      } },
    ]);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSavePhase('Saving…');
    try {
      const assets = normalizeCustomStickerAssets(customStickers);
      const clean = normalizeStickerList(stickers, assets)
        .sort((a, b) => a.z - b.z)
        .map((item, index) => ({
          id: item.id,
          kind: item.kind,
          ...(item.kind === 'built_in' ? { sticker: item.sticker } : {}),
          ...((item.kind === 'custom_image' || item.kind === 'apple_glyph') ? { asset_id: item.asset_id } : {}),
          ...(item.kind === 'emoji' ? { content: item.content } : {}),
          ...(item.kind === 'text' ? {
            content: item.content,
            text_style: item.text_style,
            color: item.color,
          } : {}),
          x: item.x,
          y: item.y,
          scale: item.scale,
          rotation: item.rotation,
          z: index,
        }));

      if (mode === 'circle') {
        await saveCircleStickerState({
          conversationId,
          stickers: clean,
          customStickers: assets,
          existingCustomStickers,
          onPhaseChange: setSavePhase,
        });
      } else {
        await saveMyProfileStickerState({
          stickers: clean,
          customStickers: assets,
          existingCustomStickers,
          onPhaseChange: setSavePhase,
        });
      }
      navigation.goBack();
    } catch (saveError) {
      Alert.alert('Could not save decorations', saveError?.message || 'Please try again.');
    } finally {
      setSaving(false);
      setSavePhase('');
    }
  };

  if (loading) {
    return (
      <View style={themedStyles.loadingRoot}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={themedStyles.loadingText}>Opening your live profile canvas…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={themedStyles.loadingRoot}>
        <Ionicons name="alert-circle-outline" size={36} color={theme.colors.subtext} />
        <Text style={themedStyles.errorText}>{error}</Text>
        <Pressable onPress={load} style={themedStyles.retryButton}>
          <Text style={themedStyles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const previewContent = mode === 'circle' ? (
    <CircleLivePreview
      preview={preview}
      decoration={decoration}
      insets={insets}
      width={canvasSize.width || width}
      theme={theme}
    />
  ) : (
    <PersonalLivePreview
      preview={preview}
      insets={insets}
      width={canvasSize.width || width}
      theme={theme}
    />
  );

  const canvas = (
    <View
      style={[styles.canvas, { backgroundColor: background.uri ? 'transparent' : (background.color || theme.colors.bg) }]}
      onLayout={(event) => {
        const { width: nextWidth, height } = event.nativeEvent.layout;
        setCanvasSize((current) => current.width === nextWidth && current.height === height ? current : { width: nextWidth, height });
      }}
    >
      <View pointerEvents="none" style={[styles.canvasTint, { backgroundColor: background.uri ? (mode === 'circle' ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.16)') : 'transparent' }]} />
      {canvasSize.width > 0 && canvasSize.height > 0
        ? [...stickers].sort((a, b) => a.z - b.z).map((sticker) => (
          <EditorSticker
            key={sticker.id}
            sticker={sticker}
            customUrl={sticker.sticker === 'custom' ? customMap[sticker.asset_id]?.url : null}
            selected={selectedId === sticker.id}
            floating={floatingSpawnIds.has(sticker.id)}
            canvasSize={canvasSize}
            onSelect={setSelectedId}
            onMove={updateSticker}
            onBeginDrag={beginStickerDrag}
            onGuideChange={setAlignmentGuides}
          />
        ))
        : null}
      {previewContent}
      {alignmentGuides.vertical || alignmentGuides.horizontal ? (
        <View pointerEvents="none" style={styles.alignmentGuideLayer}>
          {alignmentGuides.vertical ? (
            <View style={[styles.alignmentGuideVertical, { backgroundColor: rgba(theme.circle.accent, 0.72) }]} />
          ) : null}
          {alignmentGuides.horizontal ? (
            <View style={[styles.alignmentGuideHorizontal, { backgroundColor: rgba(theme.circle.accent, 0.72) }]} />
          ) : null}
          {alignmentGuides.vertical && alignmentGuides.horizontal ? (
            <View style={[styles.alignmentGuideDot, { backgroundColor: theme.circle.accent }]} />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={themedStyles.screen}>
      {background.uri ? (
        <ImageBackground source={{ uri: background.uri }} resizeMode="cover" style={StyleSheet.absoluteFillObject}>
          {canvas}
        </ImageBackground>
      ) : canvas}

      <View pointerEvents="box-none" style={[styles.editorTopBar, { top: insets.top + 5 }]}>
        <View style={styles.editorTopLeftControls}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={themedStyles.floatingEditorButton}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>
          <Pressable
            onPress={undo}
            disabled={!canUndo || saving}
            hitSlop={8}
            style={[themedStyles.historyButton, (!canUndo || saving) && styles.historyButtonDisabled]}
          >
            <Ionicons name="arrow-undo" size={17} color={theme.colors.text} />
          </Pressable>
          <Pressable
            onPress={redo}
            disabled={!canRedo || saving}
            hitSlop={8}
            style={[themedStyles.historyButton, (!canRedo || saving) && styles.historyButtonDisabled]}
          >
            <Ionicons name="arrow-redo" size={17} color={theme.colors.text} />
          </Pressable>
        </View>
        <View style={themedStyles.livePill}>
          <Text style={themedStyles.livePillTitle}>LIVE PROFILE</Text>
          <Text style={themedStyles.livePillSubtitle}>what you place is what people see</Text>
        </View>
        <Pressable onPress={save} disabled={saving} hitSlop={10} style={themedStyles.floatingSaveButton}>
          {saving ? <ActivityIndicator size="small" color={theme.colors.text} /> : <Text style={themedStyles.saveText}>Save</Text>}
        </Pressable>
      </View>

      {saving && savePhase ? (
        <View style={[themedStyles.savePhasePill, { top: insets.top + 58 }]}>
          <Text style={themedStyles.savePhaseText}>{savePhase}</Text>
        </View>
      ) : null}

      {controlsCollapsed ? (
        <Pressable
          onPress={() => setControlsCollapsed(false)}
          style={[themedStyles.openControlsButton, { bottom: keyboardHeight ? keyboardHeight + 12 : insets.bottom + 16 }]}
        >
          <Ionicons name="color-palette-outline" size={18} color={theme.colors.text} />
          <Text style={themedStyles.openControlsText}>Stickers</Text>
        </Pressable>
      ) : (
        <View style={[themedStyles.controlPanel, { paddingBottom: Math.max(insets.bottom, 7), bottom: keyboardHeight ? keyboardHeight + 8 : 8 }]}>
          <View style={styles.controlPanelHandleRow}>
            <Text style={themedStyles.selectionHint} numberOfLines={1}>
              {selected
                ? 'Selected decoration'
                : stickers.length
                  ? 'Tap a decoration to edit it'
                  : 'Add an emoji, text, or image below'}
            </Text>
            <Pressable onPress={() => setControlsCollapsed(true)} hitSlop={8} style={styles.collapseButton}>
              <Ionicons name="chevron-down" size={20} color={theme.colors.subtext} />
            </Pressable>
          </View>

          {selected ? (
            <View style={styles.editControls}>
              <SelectionControlGroup
                label="Size"
                leftIcon="remove"
                rightIcon="add"
                onLeft={() => scaleSelected(-0.12)}
                onRight={() => scaleSelected(0.12)}
                theme={theme}
              />
              <SelectionControlGroup
                label="Rotate"
                leftIcon="arrow-undo"
                rightIcon="arrow-redo"
                onLeft={() => rotateSelected(-15)}
                onRight={() => rotateSelected(15)}
                theme={theme}
              />
              <SelectionControlGroup
                label="Layer"
                leftIcon="arrow-down"
                rightIcon="arrow-up"
                onLeft={() => moveLayer('back')}
                onRight={() => moveLayer('front')}
                theme={theme}
              />
              <Pressable onPress={deleteSelected} style={({ pressed }) => [styles.selectionDeleteButton, pressed && styles.pressed]}>
                <View style={styles.selectionDeleteIcon}>
                  <Ionicons name="trash-outline" size={17} color="#B42318" />
                </View>
                <Text style={styles.selectionDeleteLabel}>Delete</Text>
              </Pressable>
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packRow}>
            {PACKS.map((pack) => (
              <Pressable
                key={pack}
                onPress={() => setActivePack(pack)}
                style={[themedStyles.packButton, activePack === pack && themedStyles.packButtonActive]}
              >
                <Text style={[themedStyles.packText, activePack === pack && themedStyles.packTextActive]}>{pack}</Text>
              </Pressable>
            ))}
            <Pressable onPress={clearAll} style={themedStyles.clearButton}>
              <Text style={themedStyles.clearText}>Clear placed</Text>
            </Pressable>
          </ScrollView>

          {activePack === 'Emoji' ? (
            <View style={styles.typeComposerBlock}>
              <View style={styles.typeComposerRow}>
                <TextInput
                  value={emojiInput}
                  onChangeText={setEmojiInput}
                  onSubmitEditing={() => addEmoji(emojiInput)}
                  maxLength={MAX_EMOJI_DECORATION_LENGTH}
                  placeholder="Type or paste emoji"
                  placeholderTextColor={theme.colors.subtext}
                  style={themedStyles.emojiInput}
                />
                <Pressable onPress={() => addEmoji(emojiInput)} style={themedStyles.addComposerButton}>
                  <Text style={themedStyles.addComposerText}>Add</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiPalette}>
                {EMOJI_DECALS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => addEmoji(emoji)}
                    style={({ pressed }) => [themedStyles.emojiPaletteItem, pressed && styles.pressed]}
                  >
                    <Text style={styles.emojiPaletteText}>{emoji}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : activePack === 'Text' ? (
            <View style={styles.typeComposerBlock}>
              <View style={styles.typeComposerRow}>
                <TextInput
                  value={textInput}
                  onChangeText={setTextInput}
                  onSubmitEditing={addText}
                  maxLength={MAX_TEXT_DECORATION_LENGTH}
                  placeholder="Write something…"
                  placeholderTextColor={theme.colors.subtext}
                  style={themedStyles.textDecorationInput}
                />
                <Pressable onPress={addText} style={themedStyles.addComposerButton}>
                  <Text style={themedStyles.addComposerText}>Add</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.textOptionsRow}>
                {TEXT_DECORATION_STYLES.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => setTextStyle(option.id)}
                    style={[themedStyles.textStyleChip, textStyle === option.id && themedStyles.textStyleChipActive]}
                  >
                    <Text style={[themedStyles.textStyleChipText, textStyle === option.id && themedStyles.textStyleChipTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
                <View style={styles.colorDivider} />
                {TEXT_DECORATION_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setTextColor(color)}
                    style={[
                      styles.textColorSwatch,
                      { backgroundColor: color },
                      color === '#FFFFFF' && styles.textColorSwatchLight,
                      textColor === color && { borderColor: theme.circle.accent, borderWidth: 2 },
                    ]}
                  />
                ))}
              </ScrollView>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.palette}>
              <Pressable onPress={pickCustomSticker} style={({ pressed }) => [themedStyles.uploadPaletteItem, pressed && styles.pressed]}>
                <View style={themedStyles.uploadIcon}>
                  <Ionicons name="add" size={22} color={theme.colors.text} />
                </View>
                <Text style={themedStyles.paletteLabel}>Upload</Text>
              </Pressable>
              {customStickers.map((asset) => (
                <View key={asset.id} style={themedStyles.customPaletteWrap}>
                  <Pressable
                    onPress={() => addSticker('custom', asset.id)}
                    style={({ pressed }) => [themedStyles.paletteItem, pressed && styles.pressed]}
                  >
                    <StickerArt stickerId="custom" kind="custom_image" customUrl={asset.url} size={48} />
                    <Text style={themedStyles.paletteLabel}>Yours</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeCustomAsset(asset)}
                    hitSlop={6}
                    style={themedStyles.removeUploadButton}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          <Text style={themedStyles.limitText}>
            {stickers.length}/{MAX_DECORATION_STICKERS} decorations · {customStickers.length}/{MAX_CUSTOM_STICKER_ASSETS} image assets
          </Text>
        </View>
      )}
    </View>
  );
}

function SelectionControlGroup({ label, leftIcon, rightIcon, onLeft, onRight, theme }) {
  return (
    <View style={styles.selectionControlGroup}>
      <View style={[styles.selectionControlSegment, { backgroundColor: theme.circle.accentSoft }]}>
        <Pressable onPress={onLeft} hitSlop={4} style={({ pressed }) => [styles.selectionControlHalf, pressed && styles.pressed]}>
          <Ionicons name={leftIcon} size={16} color={theme.colors.text} />
        </Pressable>
        <View style={styles.selectionControlDivider} />
        <Pressable onPress={onRight} hitSlop={4} style={({ pressed }) => [styles.selectionControlHalf, pressed && styles.pressed]}>
          <Ionicons name={rightIcon} size={16} color={theme.colors.text} />
        </Pressable>
      </View>
      <Text style={[styles.selectionControlLabel, { color: theme.colors.subtext }]}>{label}</Text>
    </View>
  );
}

export function ProfileStickerEditorScreen(props) {
  return <StickerEditorContent {...props} forcedMode="profile" />;
}

export function CircleStickerEditorScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <StickerEditorContent {...props} forcedMode="circle" />
    </CircleThemeBoundary>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, overflow: 'hidden' },
  canvasTint: { ...StyleSheet.absoluteFillObject },
  editorSticker: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  editorStickerSelected: { zIndex: 65 },
  editorStickerFloating: {
    zIndex: 92,
    shadowColor: '#0A1222',
    shadowOpacity: 0.22,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 12,
  },
  selectionRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(10,18,34,0.72)',
    borderStyle: 'dashed',
  },
  livePreviewLayer: { ...StyleSheet.absoluteFillObject, zIndex: 70 },
  editorTopBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editorTopLeftControls: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  historyButtonDisabled: { opacity: 0.34 },
  alignmentGuideLayer: { ...StyleSheet.absoluteFillObject, zIndex: 105 },
  alignmentGuideVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: StyleSheet.hairlineWidth,
  },
  alignmentGuideHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: StyleSheet.hairlineWidth,
  },
  alignmentGuideDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 6,
    height: 6,
    marginLeft: -3,
    marginTop: -3,
    borderRadius: 3,
  },
  previewTopControl: {
    position: 'absolute',
    zIndex: 75,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  previewTopControlLeft: { left: 10 },
  previewTopControlRight: { right: 10 },
  profilePreviewGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  circlePreviewHeader: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  circlePreviewHeaderImageWrap: {
    alignSelf: 'stretch',
    marginHorizontal: -18,
    marginBottom: -34,
    overflow: 'hidden',
  },
  circlePreviewHeaderImageTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,18,34,0.05)' },
  circlePreviewAvatar: {
    zIndex: 2,
    padding: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  circlePreviewTitle: {
    marginTop: 7,
    fontFamily: 'Manrope_700Bold',
    fontSize: 21,
    textAlign: 'center',
  },
  circlePreviewBio: {
    maxWidth: 440,
    marginTop: 5,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  circlePreviewStats: { width: '100%', maxWidth: 400, flexDirection: 'row', marginTop: 10 },
  circlePreviewStat: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  circlePreviewStatValue: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  circlePreviewStatLabel: { marginTop: 1, fontFamily: 'Manrope_400Regular', fontSize: 11 },
  circlePreviewActions: { width: '100%', maxWidth: 390, flexDirection: 'row', gap: 8, marginTop: 10 },
  circlePreviewAction: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circlePreviewSecondaryAction: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  circlePreviewActionText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  circlePreviewPeople: { paddingTop: 7, paddingBottom: 8 },
  circlePreviewPeopleTitle: { marginHorizontal: 14, marginBottom: 7, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  circlePreviewPeopleRow: { flexDirection: 'row', paddingHorizontal: 10 },
  circlePreviewPerson: { width: 68, alignItems: 'center' },
  circlePreviewPersonName: { width: 66, marginTop: 4, fontFamily: 'Manrope_600SemiBold', fontSize: 10, textAlign: 'center' },
  circlePreviewTabs: { height: 42, flexDirection: 'row' },
  circlePreviewTab: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  circlePreviewTabText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  circlePreviewGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  circlePreviewPostSlot: { alignItems: 'center', justifyContent: 'center' },
  circlePreviewPost: { overflow: 'hidden', borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.42)' },
  controlPanelHandleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 26 },
  collapseButton: { width: 34, alignItems: 'flex-end', justifyContent: 'center' },
  editControls: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 6 },
  selectionControlGroup: { flex: 1, maxWidth: 86, alignItems: 'center' },
  selectionControlSegment: {
    width: '100%',
    height: 34,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  selectionControlHalf: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center' },
  selectionControlDivider: { width: StyleSheet.hairlineWidth, height: 19, backgroundColor: 'rgba(10,18,34,0.13)' },
  selectionControlLabel: { marginTop: 2, fontFamily: 'Manrope_600SemiBold', fontSize: 8.2, textAlign: 'center' },
  selectionDeleteButton: { width: 47, alignItems: 'center' },
  selectionDeleteIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,35,24,0.10)',
  },
  selectionDeleteLabel: { marginTop: 2, color: '#B42318', fontFamily: 'Manrope_600SemiBold', fontSize: 8.2, textAlign: 'center' },
  packRow: { paddingVertical: 3, gap: 6, alignItems: 'center' },
  palette: { paddingTop: 8, paddingBottom: 3, gap: 8 },
  typeComposerBlock: { paddingTop: 7, paddingBottom: 2 },
  typeComposerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  emojiPalette: { gap: 6, paddingTop: 7, paddingBottom: 2 },
  emojiPaletteText: { fontSize: 27, lineHeight: 32 },
  textOptionsRow: { gap: 6, paddingTop: 7, paddingBottom: 2, alignItems: 'center' },
  colorDivider: { width: 1, height: 22, marginHorizontal: 2, backgroundColor: 'rgba(10,18,34,0.10)' },
  textColorSwatch: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(10,18,34,0.12)' },
  textColorSwatchLight: { borderColor: 'rgba(10,18,34,0.20)' },
  pressed: { opacity: 0.62 },
});

function createThemedStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.bg },
    loadingRoot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg,
      paddingHorizontal: 28,
    },
    loadingText: { marginTop: 9, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
    errorText: { marginTop: 10, color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
    retryButton: {
      marginTop: 14,
      minHeight: 40,
      paddingHorizontal: 17,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.accent,
    },
    retryText: { color: theme.colors.onPrimary, fontFamily: 'Manrope_700Bold' },
    floatingEditorButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.82)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.9)',
    },
    historyButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.78)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.88)',
    },
    livePill: {
      minHeight: 38,
      paddingHorizontal: 14,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.86)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.9)',
    },
    livePillTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.8 },
    livePillSubtitle: { marginTop: 1, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 7.5 },
    floatingSaveButton: {
      minWidth: 54,
      height: 40,
      paddingHorizontal: 12,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.86)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.9)',
    },
    saveText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
    savePhasePill: {
      position: 'absolute',
      alignSelf: 'center',
      zIndex: 125,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.9)',
    },
    savePhaseText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 9.5 },
    controlPanel: {
      position: 'absolute',
      left: 8,
      right: 8,
      bottom: 8,
      zIndex: 120,
      paddingHorizontal: 10,
      paddingTop: 6,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.88)',
      backgroundColor: 'rgba(255,255,255,0.91)',
      shadowColor: '#0A1222',
      shadowOpacity: 0.14,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 6 },
      elevation: 9,
    },
    selectionHint: { flex: 1, color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 9.5 },
    packButton: {
      minHeight: 29,
      paddingHorizontal: 11,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSoft,
    },
    packButtonActive: { backgroundColor: theme.circle.accentSoft },
    packText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
    packTextActive: { color: theme.colors.text, fontFamily: 'Manrope_700Bold' },
    clearButton: { minHeight: 29, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
    clearText: { color: '#B42318', fontFamily: 'Manrope_600SemiBold', fontSize: 9.5 },
    emojiInput: {
      flex: 1,
      minHeight: 38,
      paddingHorizontal: 12,
      borderRadius: 13,
      color: theme.colors.text,
      fontSize: 20,
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(10,18,34,0.08)',
    },
    textDecorationInput: {
      flex: 1,
      minHeight: 38,
      paddingHorizontal: 12,
      borderRadius: 13,
      color: theme.colors.text,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 12,
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(10,18,34,0.08)',
    },
    addComposerButton: {
      minWidth: 54,
      minHeight: 38,
      paddingHorizontal: 12,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.accentSoft,
    },
    addComposerText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 11 },
    emojiPaletteItem: {
      width: 48,
      height: 48,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSoft,
    },
    textStyleChip: {
      minHeight: 28,
      paddingHorizontal: 10,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSoft,
    },
    textStyleChipActive: { backgroundColor: theme.circle.accentSoft },
    textStyleChipText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 9.5 },
    textStyleChipTextActive: { color: theme.colors.text, fontFamily: 'Manrope_700Bold' },
    paletteItem: {
      width: 69,
      minHeight: 68,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 5,
      backgroundColor: theme.colors.surfaceSoft,
    },
    uploadPaletteItem: {
      width: 69,
      minHeight: 68,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 5,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.circle.accent,
      backgroundColor: theme.circle.accentSoft,
    },
    uploadIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.58)' },
    customPaletteWrap: { position: 'relative' },
    removeUploadButton: {
      position: 'absolute',
      top: -4,
      right: -4,
      zIndex: 5,
      width: 19,
      height: 19,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(10,18,34,0.78)',
      borderWidth: 1,
      borderColor: '#fff',
    },
    paletteLabel: { marginTop: 2, color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 8, textAlign: 'center' },
    limitText: { marginTop: 2, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 8.5, textAlign: 'right' },
    openControlsButton: {
      position: 'absolute',
      alignSelf: 'center',
      zIndex: 120,
      minHeight: 42,
      paddingHorizontal: 16,
      borderRadius: 21,
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.95)',
    },
    openControlsText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 11 },
  });
}
