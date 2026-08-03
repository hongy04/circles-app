import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ImageBackground,
  Keyboard,
  PanResponder,
  Platform,
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

import {
  canImportAppleGlyphs,
  discardTemporaryAppleGlyphAsync,
  hasCirclesExpressiveInputBridge,
  pickAppleGlyphAsync,
} from '../../../modules/circles-expressive-input';

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
const PACK_META = {
  Emoji: { icon: 'happy-outline', hint: 'Quick picks' },
  Text: { icon: 'text-outline', hint: 'Words & color' },
  Yours: { icon: 'albums-outline', hint: 'Sticker shelf' },
};

function makeEditorFingerprint(stickers = [], customStickers = []) {
  return JSON.stringify({
    stickers: stickers.map((item) => ({
      id: item?.id || '',
      kind: item?.kind || '',
      sticker: item?.sticker || null,
      asset_id: item?.asset_id || null,
      content: item?.content || null,
      text_style: item?.text_style || null,
      color: item?.color || null,
      x: Number(item?.x) || 0,
      y: Number(item?.y) || 0,
      scale: Number(item?.scale) || 0,
      rotation: Number(item?.rotation) || 0,
      z: Number(item?.z) || 0,
    })),
    assets: customStickers.map((asset) => ({
      id: asset?.id || '',
      path: asset?.path || null,
      localUri: asset?.path ? null : (asset?.localUri || asset?.url || null),
      mimeType: asset?.mimeType || asset?.mime_type || 'image/png',
      source: isAppleStickerAsset(asset) ? 'apple_glyph' : 'custom_image',
    })),
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function stableShortHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function makeAppleStickerAssetId(contentIdentifier) {
  const raw = String(contentIdentifier || '').trim();
  if (!raw) return `apple-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Keep Apple's stable identifier out of Circles persistence while retaining
  // deterministic duplicate detection for this tiny per-space asset library.
  return `apple-${stableShortHash(raw)}-${stableShortHash(`circles:${raw}`)}`;
}

function isAppleStickerAsset(asset) {
  return asset?.source === 'apple_glyph' || String(asset?.id || '').startsWith('apple-');
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
  accentColor,
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
      {selected ? (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.selectionRing,
              sticker.kind === 'text' && styles.selectionRingText,
              { borderColor: rgba(accentColor, 0.92) },
            ]}
          />
          <View pointerEvents="none" style={[styles.selectionDot, { backgroundColor: accentColor }]} />
        </>
      ) : null}
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
  const { width, height: windowHeight } = useWindowDimensions();
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
  const [editingContentId, setEditingContentId] = useState(null);
  const [textStyle, setTextStyle] = useState('glass');
  const [textColor, setTextColor] = useState('#0A1222');
  const [importingAppleGlyph, setImportingAppleGlyph] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [background, setBackground] = useState({ uri: null, color: null });
  const [preview, setPreview] = useState(null);
  const [decoration, setDecoration] = useState(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const [alignmentGuides, setAlignmentGuides] = useState({ vertical: false, horizontal: false });
  const [, setHistoryVersion] = useState(0);
  const historyRef = useRef({ undo: [], redo: [] });
  const stickersRef = useRef(stickers);
  const customStickersRef = useRef(customStickers);
  const savedFingerprintRef = useRef('');
  const allowExitRef = useRef(false);
  const appleTemporaryUrisRef = useRef(new Set());
  const emojiInputRef = useRef(null);
  const textInputRef = useRef(null);
  const panelTranslateY = useRef(new Animated.Value(0)).current;
  const packContentAnim = useRef(new Animated.Value(1)).current;
  const panelYRef = useRef(0);
  const panelHeightRef = useRef(0);
  const panelInitializedRef = useRef(false);
  const panelDragStartRef = useRef(0);
  stickersRef.current = stickers;
  customStickersRef.current = customStickers;

  const getPanelBounds = useCallback((measuredHeight = panelHeightRef.current) => {
    const height = Math.max(1, measuredHeight || 1);
    const minY = Math.max(insets.top + 58, 70);
    const keyboardTop = keyboardHeight > 0 ? windowHeight - keyboardHeight : windowHeight;
    const maxY = Math.max(minY, keyboardTop - height - Math.max(insets.bottom, 8) - 8);
    return { minY, maxY };
  }, [insets.bottom, insets.top, keyboardHeight, windowHeight]);

  const movePanelTo = useCallback((nextY, animated = false) => {
    const { minY, maxY } = getPanelBounds();
    const clampedY = clamp(nextY, minY, maxY);
    panelYRef.current = clampedY;
    panelTranslateY.stopAnimation();
    if (animated) {
      Animated.spring(panelTranslateY, {
        toValue: clampedY,
        useNativeDriver: true,
        damping: 24,
        stiffness: 230,
        mass: 0.8,
      }).start();
    } else {
      panelTranslateY.setValue(clampedY);
    }
  }, [getPanelBounds, panelTranslateY]);

  const handlePanelLayout = useCallback((event) => {
    const nextHeight = Math.ceil(event?.nativeEvent?.layout?.height || 0);
    if (!nextHeight) return;
    panelHeightRef.current = nextHeight;
    setPanelHeight((current) => current === nextHeight ? current : nextHeight);
    const { minY, maxY } = getPanelBounds(nextHeight);
    if (!panelInitializedRef.current) {
      panelInitializedRef.current = true;
      panelYRef.current = maxY;
      panelTranslateY.setValue(maxY);
      return;
    }
    if (panelYRef.current < minY || panelYRef.current > maxY) {
      const clampedY = clamp(panelYRef.current, minY, maxY);
      movePanelTo(clampedY, true);
    }
  }, [getPanelBounds, movePanelTo, panelTranslateY]);

  const panelDragResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      panelDragStartRef.current = panelYRef.current;
    },
    onPanResponderMove: (_, gesture) => {
      const { minY, maxY } = getPanelBounds();
      const nextY = clamp(panelDragStartRef.current + gesture.dy, minY, maxY);
      panelYRef.current = nextY;
      panelTranslateY.setValue(nextY);
    },
    onPanResponderRelease: () => movePanelTo(panelYRef.current, true),
    onPanResponderTerminate: () => movePanelTo(panelYRef.current, true),
  }), [getPanelBounds, movePanelTo, panelTranslateY]);

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

  const cleanupTemporaryAppleImports = useCallback(async () => {
    const uris = [...appleTemporaryUrisRef.current];
    appleTemporaryUrisRef.current.clear();
    if (!uris.length) return;
    await Promise.all(uris.map((uri) => discardTemporaryAppleGlyphAsync(uri).catch(() => false)));
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(Math.max(0, event?.endCoordinates?.height || 0));
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!panelInitializedRef.current || !panelHeightRef.current || keyboardHeight <= 0) return;
    const { maxY } = getPanelBounds(panelHeightRef.current);
    if (panelYRef.current > maxY) movePanelTo(maxY, true);
  }, [getPanelBounds, keyboardHeight, movePanelTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setFloatingSpawnIds(new Set());
    setAlignmentGuides({ vertical: false, horizontal: false });
    setEditingContentId(null);
    setEmojiInput('');
    setTextInput('');
    savedFingerprintRef.current = '';
    allowExitRef.current = false;
    appleTemporaryUrisRef.current.clear();
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
        const nextStickers = normalizeStickerList(decorationRows.circle_stickers, assets);
        setCustomStickers(assets);
        setExistingCustomStickers(assets);
        setStickers(nextStickers);
        savedFingerprintRef.current = makeEditorFingerprint(nextStickers, assets);
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
        const nextStickers = normalizeStickerList(ownDecoration.profile_stickers, assets);
        setCustomStickers(assets);
        setExistingCustomStickers(assets);
        setStickers(nextStickers);
        savedFingerprintRef.current = makeEditorFingerprint(nextStickers, assets);
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
  const selectedAssetId = selected && (selected.kind === 'custom_image' || selected.kind === 'apple_glyph' || selected.sticker === 'custom')
    ? selected.asset_id
    : null;
  const canvasAtLimit = stickers.length >= MAX_DECORATION_STICKERS;
  const assetLibraryAtLimit = customStickers.length >= MAX_CUSTOM_STICKER_ASSETS;
  const canUndo = historyRef.current.undo.length > 0;
  const canRedo = historyRef.current.redo.length > 0;
  const appleGlyphBridgePresent = Platform.OS === 'ios' && hasCirclesExpressiveInputBridge();
  const appleGlyphAvailable = appleGlyphBridgePresent && canImportAppleGlyphs();
  const editorFingerprint = useMemo(
    () => makeEditorFingerprint(stickers, customStickers),
    [customStickers, stickers]
  );
  const hasUnsavedChanges = Boolean(savedFingerprintRef.current) && editorFingerprint !== savedFingerprintRef.current;

  useEffect(() => {
    packContentAnim.stopAnimation();
    packContentAnim.setValue(0);
    Animated.timing(packContentAnim, {
      toValue: 1,
      duration: 155,
      useNativeDriver: true,
    }).start();
  }, [activePack, packContentAnim]);

  const displayStickers = useMemo(() => stickers.map((item) => {
    if (!editingContentId || item.id !== editingContentId) return item;
    if (item.kind === 'text') {
      return {
        ...item,
        content: textInput.length ? textInput : ' ',
        text_style: textStyle,
        color: textColor,
      };
    }
    if (item.kind === 'emoji') {
      return { ...item, content: emojiInput.length ? emojiInput : ' ' };
    }
    return item;
  }), [editingContentId, emojiInput, stickers, textColor, textInput, textStyle]);

  const revealSelectedDecoration = useCallback((item = selected) => {
    if (!item || !panelInitializedRef.current || !panelHeightRef.current || !canvasSize.height) return;
    const draftItem = displayStickers.find((candidate) => candidate.id === item.id) || item;
    const box = getDecorationRenderBox(draftItem, STICKER_BASE_SIZE);
    const centerY = canvasSize.height * draftItem.y;
    const decorationTop = centerY - (box.height / 2) - 18;
    const decorationBottom = centerY + (box.height / 2) + 18;
    const panelTop = panelYRef.current;
    const panelBottom = panelTop + panelHeightRef.current;
    const overlaps = decorationBottom >= panelTop && decorationTop <= panelBottom;
    if (!overlaps) return;

    const { minY, maxY } = getPanelBounds(panelHeightRef.current);
    const topSpace = decorationTop - minY;
    const bottomSpace = maxY - decorationBottom;
    movePanelTo(topSpace >= bottomSpace ? minY : maxY, true);
  }, [canvasSize.height, displayStickers, getPanelBounds, movePanelTo, selected]);

  useEffect(() => {
    if (!editingContentId || !selected || selected.id !== editingContentId || !panelHeight) return;
    const timer = setTimeout(() => revealSelectedDecoration(selected), 40);
    return () => clearTimeout(timer);
  }, [editingContentId, panelHeight, revealSelectedDecoration, selected]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowExitRef.current) return;

      if (!hasUnsavedChanges) {
        if (!appleTemporaryUrisRef.current.size) return;
        event.preventDefault();
        cleanupTemporaryAppleImports().finally(() => {
          allowExitRef.current = true;
          navigation.dispatch(event.data.action);
        });
        return;
      }

      event.preventDefault();
      Alert.alert(
        'Discard decoration changes?',
        'Your placed decorations and sticker-library changes have not been saved yet.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              await cleanupTemporaryAppleImports();
              allowExitRef.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [cleanupTemporaryAppleImports, hasUnsavedChanges, navigation]);

  useEffect(() => {
    if (!editingContentId) return;
    const editingItem = stickers.find((item) => item.id === editingContentId);
    if (!editingItem || editingItem.id !== selectedId) {
      setEditingContentId(null);
      setEmojiInput('');
      setTextInput('');
    }
  }, [editingContentId, selectedId, stickers]);

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

    const editingItem = editingContentId
      ? stickers.find((item) => item.id === editingContentId && item.kind === 'emoji')
      : null;
    if (editingItem) {
      if (editingItem.content !== content) {
        recordHistory();
        updateSticker(editingItem.id, { content });
      }
      setEmojiInput('');
      setEditingContentId(null);
      Keyboard.dismiss();
      return;
    }

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
      Alert.alert(editingContentId ? 'Keep some text' : 'Add some text', 'Type a short phrase first.');
      return;
    }

    const editingItem = editingContentId
      ? stickers.find((item) => item.id === editingContentId && item.kind === 'text')
      : null;
    if (editingItem) {
      const changed = editingItem.content !== content
        || editingItem.text_style !== textStyle
        || editingItem.color !== textColor;
      if (changed) {
        recordHistory();
        const nextSticker = {
          ...editingItem,
          content,
          text_style: textStyle,
          color: textColor,
        };
        const safe = getSafeDecorationPosition(nextSticker, canvasSize, editingItem.x, editingItem.y, STICKER_BASE_SIZE);
        updateSticker(editingItem.id, {
          content,
          text_style: textStyle,
          color: textColor,
          ...safe,
        });
      }
      setTextInput('');
      setEditingContentId(null);
      Keyboard.dismiss();
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

  const pickAppleSticker = async () => {
    if (!appleGlyphBridgePresent) {
      Alert.alert(
        'Apple Stickers need the Circles iOS build',
        'This option becomes active in a Circles development or production build, not Expo Go.'
      );
      return;
    }
    if (!appleGlyphAvailable) {
      Alert.alert('Apple Stickers need iOS 18', 'Update this iPhone to iOS 18 or later to import Apple expressive stickers.');
      return;
    }

    setImportingAppleGlyph(true);
    try {
      const result = await pickAppleGlyphAsync();
      if (!result?.uri) return;
      if (result.byteSize && result.byteSize > 9_500_000) {
        await discardTemporaryAppleGlyphAsync(result.uri).catch(() => false);
        Alert.alert('Sticker is too large', 'This Apple sticker could not be imported because its rendered image is too large.');
        return;
      }

      const id = makeAppleStickerAssetId(result.contentIdentifier);
      const existingAsset = customStickers.find((asset) => asset.id === id);

      // A duplicate does not consume another library slot, so allow it even
      // when the 24-image library is already full.
      if (!existingAsset && customStickers.length >= MAX_CUSTOM_STICKER_ASSETS) {
        await discardTemporaryAppleGlyphAsync(result.uri).catch(() => false);
        Alert.alert('Sticker library full', `You can keep up to ${MAX_CUSTOM_STICKER_ASSETS} sticker images in this space.`);
        return;
      }

      setActivePack('Yours');

      if (existingAsset) {
        // We already have the persisted/local image for this stable Apple
        // glyph, so the newly rendered cache file is unnecessary.
        await discardTemporaryAppleGlyphAsync(result.uri).catch(() => false);
        if (stickers.length >= MAX_DECORATION_STICKERS) {
          Alert.alert('Decoration limit reached', `You can place up to ${MAX_DECORATION_STICKERS} decorations in this space.`);
          return;
        }
        appendSticker(makeDecorationInstance({ kind: 'apple_glyph', assetId: id }, stickers.length));
        return;
      }

      const custom = {
        id,
        path: null,
        localUri: result.uri,
        url: result.uri,
        mimeType: 'image/png',
        source: 'apple_glyph',
      };
      appleTemporaryUrisRef.current.add(result.uri);

      recordHistory();
      setCustomStickers((current) => {
        const next = [...current, custom];
        customStickersRef.current = next;
        return next;
      });

      if (stickers.length < MAX_DECORATION_STICKERS) {
        appendSticker(makeDecorationInstance({ kind: 'apple_glyph', assetId: id }, stickers.length), { record: false });
      } else {
        Alert.alert('Apple sticker imported', 'It is saved in Yours. Remove a placed decoration when you want to add it to the canvas.');
      }
    } catch (appleError) {
      Alert.alert(
        'Could not import Apple sticker',
        appleError?.message || 'Try choosing the sticker again.'
      );
    } finally {
      setImportingAppleGlyph(false);
    }
  };

  const addLibraryAssetToCanvas = (asset) => {
    if (!asset) return;
    if (stickers.length >= MAX_DECORATION_STICKERS) {
      Alert.alert('Decoration limit reached', `You can place up to ${MAX_DECORATION_STICKERS} decorations in this space.`);
      return;
    }
    appendSticker(makeDecorationInstance({
      kind: isAppleStickerAsset(asset) ? 'apple_glyph' : 'custom_image',
      assetId: asset.id,
    }, stickers.length));
  };

  const chooseEmojiPreset = (emoji) => {
    if (editingContentId) {
      setEmojiInput(emoji);
      return;
    }
    addEmoji(emoji);
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

  const cancelContentEdit = () => {
    setEditingContentId(null);
    setEmojiInput('');
    setTextInput('');
    Keyboard.dismiss();
  };

  const editSelectedContent = () => {
    if (!selected || (selected.kind !== 'text' && selected.kind !== 'emoji')) return;
    Keyboard.dismiss();
    setControlsCollapsed(false);
    setEditingContentId(selected.id);
    if (selected.kind === 'text') {
      setActivePack('Text');
      setTextInput(selected.content || '');
      setTextStyle(selected.text_style || 'glass');
      setTextColor(selected.color || '#0A1222');
    } else {
      setActivePack('Emoji');
      setEmojiInput(selected.content || '');
    }
  };

  const duplicateSelected = () => {
    if (!selected) return;
    if (stickers.length >= MAX_DECORATION_STICKERS) {
      Alert.alert('Decoration limit reached', `You can place up to ${MAX_DECORATION_STICKERS} decorations in this space.`);
      return;
    }

    const copy = {
      ...selected,
      id: `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: clamp(selected.x + 0.045, 0.04, 0.96),
      y: clamp(selected.y + 0.035, 0.04, 0.96),
    };
    const safe = getSafeDecorationPosition(copy, canvasSize, copy.x, copy.y, STICKER_BASE_SIZE);
    appendSticker({ ...copy, ...safe });
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
    const nextScale = clamp(selected.scale + delta, 0.55, 2.2);
    if (Math.abs(nextScale - selected.scale) < 0.0001) return;
    recordHistory();
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
      savedFingerprintRef.current = makeEditorFingerprint(clean, assets);
      await cleanupTemporaryAppleImports();
      allowExitRef.current = true;
      navigation.goBack();
    } catch (saveError) {
      Alert.alert('Could not save decorations', saveError?.message || 'Please try again.');
    } finally {
      setSaving(false);
      setSavePhase('');
    }
  };

  const saveOrDone = async () => {
    if (hasUnsavedChanges) {
      save();
      return;
    }
    await cleanupTemporaryAppleImports();
    allowExitRef.current = true;
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={themedStyles.loadingRoot}>
        <ActivityIndicator color={theme.circle.accent} />
        <Text style={themedStyles.loadingText}>Opening your live {mode === 'circle' ? 'Circle' : 'profile'} canvas…</Text>
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
        ? [...displayStickers].sort((a, b) => a.z - b.z).map((sticker) => (
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
            accentColor={theme.circle.accent}
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
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close decoration editor"
            style={themedStyles.floatingEditorButton}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>
          <Pressable
            onPress={undo}
            disabled={!canUndo || saving}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Undo decoration change"
            accessibilityState={{ disabled: !canUndo || saving }}
            style={[themedStyles.historyButton, (!canUndo || saving) && styles.historyButtonDisabled]}
          >
            <Ionicons name="arrow-undo" size={17} color={theme.colors.text} />
          </Pressable>
          <Pressable
            onPress={redo}
            disabled={!canRedo || saving}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Redo decoration change"
            accessibilityState={{ disabled: !canRedo || saving }}
            style={[themedStyles.historyButton, (!canRedo || saving) && styles.historyButtonDisabled]}
          >
            <Ionicons name="arrow-redo" size={17} color={theme.colors.text} />
          </Pressable>
        </View>
        <View style={themedStyles.livePill}>
          <Text style={themedStyles.livePillTitle}>{mode === 'circle' ? 'LIVE CIRCLE' : 'LIVE PROFILE'}</Text>
          <Text style={themedStyles.livePillSubtitle}>{hasUnsavedChanges ? 'unsaved changes' : 'what you place is what people see'}</Text>
        </View>
        <Pressable
          onPress={saveOrDone}
          disabled={saving}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={hasUnsavedChanges ? 'Save decoration changes' : 'Finish decorating'}
          style={themedStyles.floatingSaveButton}
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.text} />
          ) : (
            <Text style={themedStyles.saveText}>{hasUnsavedChanges ? 'Save' : 'Done'}</Text>
          )}
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
          accessibilityRole="button"
          accessibilityLabel="Open decoration controls"
          style={[themedStyles.openControlsButton, { bottom: keyboardHeight ? keyboardHeight + 12 : insets.bottom + 16 }]}
        >
          <Ionicons name="color-palette-outline" size={18} color={theme.colors.text} />
          <Text style={themedStyles.openControlsText}>Decorate</Text>
        </Pressable>
      ) : (
        <Animated.View
          onLayout={handlePanelLayout}
          style={[
            themedStyles.controlPanel,
            {
              paddingBottom: Math.max(insets.bottom, 7),
              opacity: panelHeight ? 1 : 0,
              transform: [{ translateY: panelTranslateY }],
            },
          ]}
        >
          <View style={styles.controlPanelHeader}>
            <View
              {...panelDragResponder.panHandlers}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Move decoration tools"
              accessibilityHint="Drag up or down to move the tool panel and uncover your decoration"
              style={styles.panelDragZone}
            >
              <View style={themedStyles.panelGrabber} />
              <View style={styles.panelHeaderCopy}>
                <Text style={themedStyles.panelEyebrow}>
                  {editingContentId ? 'LIVE EDIT' : selected ? 'SELECTED' : 'DECORATE'}
                </Text>
                <Text style={themedStyles.selectionHint} numberOfLines={1}>
                  {editingContentId
                    ? `Editing ${selected?.kind === 'emoji' ? 'emoji' : 'text'} · changes preview live`
                    : selected
                      ? 'Adjust this decoration or drag it on the canvas'
                      : stickers.length
                        ? 'Tap a decoration, or add something new'
                        : 'Add an emoji, text, or image'}
                </Text>
              </View>
              <Ionicons name="move-outline" size={16} color={theme.colors.subtext} />
            </View>
            {stickers.length ? (
              <Pressable
                onPress={clearAll}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Remove all placed decorations"
                style={({ pressed }) => [themedStyles.panelHeaderButton, pressed && styles.pressed]}
              >
                <Ionicons name="trash-bin-outline" size={16} color="#B42318" />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setControlsCollapsed(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Hide decoration tools"
              style={({ pressed }) => [themedStyles.panelHeaderButton, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-down" size={18} color={theme.colors.subtext} />
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
              <Pressable
                onPress={deleteSelected}
                accessibilityRole="button"
                accessibilityLabel="Delete selected decoration"
                style={({ pressed }) => [styles.selectionDeleteButton, pressed && styles.pressed]}
              >
                <View style={styles.selectionDeleteIcon}>
                  <Ionicons name="trash-outline" size={17} color="#B42318" />
                </View>
                <Text style={styles.selectionDeleteLabel}>Delete</Text>
              </Pressable>
            </View>
          ) : null}

          {selected ? (
            <View style={styles.selectionQuickActions}>
              {(selected.kind === 'text' || selected.kind === 'emoji') && !editingContentId ? (
                <Pressable
                  onPress={editSelectedContent}
                  accessibilityRole="button"
                  accessibilityLabel={selected.kind === 'text' ? 'Edit selected text' : 'Edit selected emoji'}
                  style={({ pressed }) => [themedStyles.selectionQuickAction, pressed && styles.pressed]}
                >
                  <Ionicons name="pencil-outline" size={14} color={theme.colors.text} />
                  <Text style={themedStyles.selectionQuickActionText}>Edit</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={duplicateSelected}
                accessibilityRole="button"
                accessibilityLabel="Duplicate selected decoration"
                style={({ pressed }) => [themedStyles.selectionQuickAction, pressed && styles.pressed]}
              >
                <Ionicons name="copy-outline" size={14} color={theme.colors.text} />
                <Text style={themedStyles.selectionQuickActionText}>Duplicate</Text>
              </Pressable>
            </View>
          ) : null}

          {editingContentId ? (
            <View style={themedStyles.editingBanner}>
              <View style={styles.editingBannerCopy}>
                <Ionicons name="eye-outline" size={14} color={theme.colors.text} />
                <Text style={themedStyles.editingBannerText} numberOfLines={1}>Previewing changes on the canvas</Text>
              </View>
              <Pressable
                onPress={cancelContentEdit}
                accessibilityRole="button"
                accessibilityLabel="Cancel content edit"
                style={({ pressed }) => [themedStyles.editingCancelButton, pressed && styles.pressed]}
              >
                <Text style={themedStyles.editingCancelText}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={themedStyles.packSwitcher} accessibilityRole="tablist">
            {PACKS.map((pack) => {
              const meta = PACK_META[pack];
              const isActive = activePack === pack;
              return (
                <Pressable
                  key={pack}
                  onPress={() => {
                    if (editingContentId && pack !== activePack) cancelContentEdit();
                    setActivePack(pack);
                  }}
                  accessibilityRole="tab"
                  accessibilityLabel={`${pack}. ${meta.hint}`}
                  accessibilityState={{ selected: isActive }}
                  style={({ pressed }) => [
                    themedStyles.packButton,
                    isActive && themedStyles.packButtonActive,
                    pressed && styles.packButtonPressed,
                  ]}
                >
                  <Ionicons
                    name={meta.icon}
                    size={14}
                    color={isActive ? theme.colors.text : theme.colors.subtext}
                  />
                  <Text style={[themedStyles.packText, isActive && themedStyles.packTextActive]}>{pack}</Text>
                </Pressable>
              );
            })}
          </View>

          <Animated.View
            style={[
              styles.packContentMotion,
              {
                opacity: packContentAnim,
                transform: [{
                  translateY: packContentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [5, 0],
                  }),
                }],
              },
            ]}
          >
            {activePack === 'Emoji' ? (
              <View style={styles.typeComposerBlock}>
                <View style={styles.typeComposerRow}>
                  <TextInput
                    ref={emojiInputRef}
                    value={emojiInput}
                    onChangeText={setEmojiInput}
                    onSubmitEditing={() => addEmoji(emojiInput)}
                    maxLength={MAX_EMOJI_DECORATION_LENGTH}
                    placeholder="Type or paste emoji"
                    accessibilityLabel="Emoji decoration"
                    placeholderTextColor={theme.colors.subtext}
                    style={themedStyles.emojiInput}
                  />
                  <Pressable
                    onPress={() => addEmoji(emojiInput)}
                    disabled={!String(emojiInput || '').trim()}
                    accessibilityRole="button"
                    accessibilityLabel={editingContentId ? 'Apply emoji decoration' : 'Add emoji decoration'}
                    style={({ pressed }) => [
                      themedStyles.addComposerButton,
                      !String(emojiInput || '').trim() && styles.composerActionDisabled,
                      pressed && String(emojiInput || '').trim() && styles.pressed,
                    ]}
                  >
                    <Text style={themedStyles.addComposerText}>{editingContentId ? 'Apply' : 'Add'}</Text>
                  </Pressable>
                </View>
                <View style={styles.pickerLabelRow}>
                  <Text style={themedStyles.pickerMiniLabel}>QUICK PICKS</Text>
                  <Text style={themedStyles.pickerHelperText}>{editingContentId ? 'Tap to preview · Apply when ready' : 'Tap to place instantly'}</Text>
                </View>
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="always"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.emojiPalette}
                >
                  {EMOJI_DECALS.map((emoji) => {
                    const isPreviewing = editingContentId && emojiInput === emoji;
                    return (
                      <Pressable
                        key={emoji}
                        onPress={() => chooseEmojiPreset(emoji)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${emoji} decoration`}
                        style={({ pressed }) => [
                          themedStyles.emojiPaletteItem,
                          isPreviewing && themedStyles.emojiPaletteItemActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.emojiPaletteText}>{emoji}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : activePack === 'Text' ? (
              <View style={styles.typeComposerBlock}>
                <View style={styles.typeComposerRow}>
                  <TextInput
                    ref={textInputRef}
                    value={textInput}
                    onChangeText={setTextInput}
                    onSubmitEditing={addText}
                    maxLength={MAX_TEXT_DECORATION_LENGTH}
                    placeholder="Write something…"
                    accessibilityLabel="Text decoration"
                    placeholderTextColor={theme.colors.subtext}
                    style={themedStyles.textDecorationInput}
                  />
                  <Pressable
                    onPress={addText}
                    disabled={!String(textInput || '').trim()}
                    accessibilityRole="button"
                    accessibilityLabel={editingContentId ? 'Apply text decoration' : 'Add text decoration'}
                    style={({ pressed }) => [
                      themedStyles.addComposerButton,
                      !String(textInput || '').trim() && styles.composerActionDisabled,
                      pressed && String(textInput || '').trim() && styles.pressed,
                    ]}
                  >
                    <Text style={themedStyles.addComposerText}>{editingContentId ? 'Apply' : 'Add'}</Text>
                  </Pressable>
                </View>

                <View style={styles.textToolRow}>
                  <Text style={themedStyles.pickerMiniLabel}>STYLE</Text>
                  <View style={styles.textStyleOptions}>
                    {TEXT_DECORATION_STYLES.map((option) => (
                      <Pressable
                        key={option.id}
                        onPress={() => setTextStyle(option.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: textStyle === option.id }}
                        style={({ pressed }) => [
                          themedStyles.textStyleChip,
                          textStyle === option.id && themedStyles.textStyleChipActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[themedStyles.textStyleChipText, textStyle === option.id && themedStyles.textStyleChipTextActive]}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.textToolRow}>
                  <Text style={themedStyles.pickerMiniLabel}>COLOR</Text>
                  <ScrollView
                    horizontal
                    keyboardShouldPersistTaps="always"
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.textColorOptions}
                  >
                    {TEXT_DECORATION_COLORS.map((color) => {
                      const isActive = textColor === color;
                      const darkCheck = color === '#FFFFFF' || color === '#F2A93B';
                      return (
                        <Pressable
                          key={color}
                          onPress={() => setTextColor(color)}
                          accessibilityRole="button"
                          accessibilityLabel={`Use ${color} text color`}
                          accessibilityState={{ selected: isActive }}
                          style={({ pressed }) => [
                            styles.textColorSwatch,
                            { backgroundColor: color },
                            color === '#FFFFFF' && styles.textColorSwatchLight,
                            isActive && { borderColor: theme.circle.accent, borderWidth: 2.5 },
                            pressed && styles.pressed,
                          ]}
                        >
                          {isActive ? (
                            <Ionicons name="checkmark" size={14} color={darkCheck ? '#0A1222' : '#FFFFFF'} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            ) : (
              <View style={styles.yoursBlock}>
                <View style={styles.libraryHeaderRow}>
                  <View style={styles.libraryHeaderCopy}>
                    <Text style={themedStyles.libraryTitle}>Your sticker shelf</Text>
                    <Text style={themedStyles.librarySubtitle}>
                      {customStickers.length
                        ? 'Tap a saved sticker to place another copy.'
                        : Platform.OS === 'ios'
                          ? 'Bring in an Apple Sticker or an image from Photos.'
                          : 'Bring in an image from Photos to reuse here.'}
                    </Text>
                  </View>
                  <View style={themedStyles.libraryCountPill}>
                    <Text style={themedStyles.libraryCountText}>{customStickers.length}/{MAX_CUSTOM_STICKER_ASSETS}</Text>
                  </View>
                </View>

                <View style={styles.importActionRow}>
                  {Platform.OS === 'ios' ? (
                    <Pressable
                      onPress={pickAppleSticker}
                      disabled={importingAppleGlyph}
                      accessibilityRole="button"
                      accessibilityLabel="Import from Apple Stickers"
                      style={({ pressed }) => [
                        themedStyles.importActionButton,
                        importingAppleGlyph && styles.paletteItemDisabled,
                        pressed && !importingAppleGlyph && styles.pressed,
                      ]}
                    >
                      <View style={themedStyles.importActionIcon}>
                        {importingAppleGlyph ? (
                          <ActivityIndicator size="small" color={theme.colors.text} />
                        ) : (
                          <Ionicons name="sparkles" size={17} color={theme.colors.text} />
                        )}
                      </View>
                      <View style={styles.importActionCopy}>
                        <Text style={themedStyles.importActionTitle}>{importingAppleGlyph ? 'Opening…' : 'Apple Sticker'}</Text>
                        <Text style={themedStyles.importActionSubtitle}>Sticker · Memoji · Genmoji</Text>
                      </View>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={pickCustomSticker}
                    disabled={assetLibraryAtLimit}
                    accessibilityRole="button"
                    accessibilityLabel="Import sticker image from Photos"
                    accessibilityState={{ disabled: assetLibraryAtLimit }}
                    style={({ pressed }) => [
                      themedStyles.importActionButton,
                      assetLibraryAtLimit && styles.paletteItemDisabled,
                      pressed && !assetLibraryAtLimit && styles.pressed,
                    ]}
                  >
                    <View style={themedStyles.importActionIcon}>
                      <Ionicons name="images-outline" size={17} color={theme.colors.text} />
                    </View>
                    <View style={styles.importActionCopy}>
                      <Text style={themedStyles.importActionTitle}>Photos</Text>
                      <Text style={themedStyles.importActionSubtitle}>{assetLibraryAtLimit ? 'Sticker shelf is full' : 'PNG / WebP works best'}</Text>
                    </View>
                  </Pressable>
                </View>

                {customStickers.length ? (
                  <ScrollView
                    horizontal
                    keyboardShouldPersistTaps="always"
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.libraryPalette}
                  >
                    {customStickers.map((asset) => {
                      const isApple = isAppleStickerAsset(asset);
                      const isSelectedSource = selectedAssetId === asset.id;
                      return (
                        <View key={asset.id} style={themedStyles.customPaletteWrap}>
                          <Pressable
                            onPress={() => addLibraryAssetToCanvas(asset)}
                            accessibilityRole="button"
                            accessibilityLabel={`Place saved ${isApple ? 'Apple sticker' : 'image sticker'}`}
                            style={({ pressed }) => [
                              themedStyles.libraryAssetCard,
                              isSelectedSource && themedStyles.libraryAssetCardActive,
                              pressed && styles.libraryAssetPressed,
                            ]}
                          >
                            <StickerArt
                              stickerId="custom"
                              kind={isApple ? 'apple_glyph' : 'custom_image'}
                              customUrl={asset.url}
                              size={54}
                            />
                            <View style={[themedStyles.librarySourceBadge, isApple && themedStyles.librarySourceBadgeApple]}>
                              <Ionicons name={isApple ? 'sparkles' : 'image-outline'} size={9} color={theme.colors.text} />
                            </View>
                            {isSelectedSource ? (
                              <View style={[styles.librarySelectedDot, { backgroundColor: theme.circle.accent }]}>
                                <Ionicons name="checkmark" size={10} color="#fff" />
                              </View>
                            ) : null}
                          </Pressable>
                          <Pressable
                            onPress={() => removeCustomAsset(asset)}
                            hitSlop={7}
                            accessibilityRole="button"
                            accessibilityLabel="Remove saved sticker from this shelf"
                            style={({ pressed }) => [themedStyles.removeUploadButton, pressed && styles.pressed]}
                          >
                            <Ionicons name="close" size={11} color="#fff" />
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View style={themedStyles.libraryEmptyState}>
                    <View style={themedStyles.libraryEmptyIcon}>
                      <Ionicons name="sparkles-outline" size={19} color={theme.colors.text} />
                    </View>
                    <View style={styles.libraryEmptyCopy}>
                      <Text style={themedStyles.libraryEmptyTitle}>Your reusable stickers will live here</Text>
                      <Text style={themedStyles.libraryEmptyText}>Import once, then tap it anytime you decorate this space.</Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </Animated.View>

          <View style={styles.capacityRow}>
            <View style={themedStyles.capacityPill}>
              <Ionicons name="shapes-outline" size={11} color={canvasAtLimit ? '#B42318' : theme.colors.subtext} />
              <Text style={[themedStyles.capacityText, canvasAtLimit && styles.capacityTextWarning]}>
                {stickers.length}/{MAX_DECORATION_STICKERS} placed
              </Text>
            </View>
            {activePack === 'Yours' ? (
              <View style={themedStyles.capacityPill}>
                <Ionicons name="albums-outline" size={11} color={assetLibraryAtLimit ? '#B42318' : theme.colors.subtext} />
                <Text style={[themedStyles.capacityText, assetLibraryAtLimit && styles.capacityTextWarning]}>
                  {customStickers.length}/{MAX_CUSTOM_STICKER_ASSETS} saved
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function SelectionControlGroup({ label, leftIcon, rightIcon, onLeft, onRight, theme }) {
  return (
    <View style={styles.selectionControlGroup}>
      <View style={[styles.selectionControlSegment, { backgroundColor: theme.circle.accentSoft }]}>
        <Pressable
          onPress={onLeft}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${label}: decrease`}
          style={({ pressed }) => [styles.selectionControlHalf, pressed && styles.pressed]}
        >
          <Ionicons name={leftIcon} size={16} color={theme.colors.text} />
        </Pressable>
        <View style={styles.selectionControlDivider} />
        <Pressable
          onPress={onRight}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${label}: increase`}
          style={({ pressed }) => [styles.selectionControlHalf, pressed && styles.pressed]}
        >
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
  editorStickerSelected: { zIndex: 96 },
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
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  selectionRingText: { borderRadius: 14 },
  selectionDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
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
  controlPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 42, marginBottom: 7 },
  panelDragZone: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelHeaderCopy: { flex: 1, minWidth: 0 },
  editingBannerCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  selectionQuickActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -1, marginBottom: 7 },
  packContentMotion: { minHeight: 1 },
  packButtonPressed: { transform: [{ scale: 0.985 }] },
  composerActionDisabled: { opacity: 0.38 },
  pickerLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 7 },
  textToolRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 8 },
  textStyleOptions: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  textColorOptions: { flexGrow: 1, alignItems: 'center', gap: 7, paddingRight: 2 },
  yoursBlock: { paddingTop: 8, paddingBottom: 1 },
  libraryHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  libraryHeaderCopy: { flex: 1, minWidth: 0 },
  importActionRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  importActionCopy: { flex: 1, minWidth: 0 },
  libraryPalette: { gap: 8, paddingTop: 10, paddingRight: 4, paddingBottom: 3 },
  libraryAssetPressed: { transform: [{ scale: 0.96 }], opacity: 0.82 },
  librarySelectedDot: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  libraryEmptyCopy: { flex: 1, minWidth: 0 },
  capacityRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingTop: 4 },
  capacityTextWarning: { color: '#B42318' },
  palette: { paddingTop: 8, paddingBottom: 3, gap: 8 },
  typeComposerBlock: { paddingTop: 7, paddingBottom: 2 },
  typeComposerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  emojiPalette: { gap: 6, paddingTop: 6, paddingBottom: 2 },
  emojiPaletteText: { fontSize: 27, lineHeight: 32 },
  textOptionsRow: { gap: 6, paddingTop: 7, paddingBottom: 2, alignItems: 'center' },
  colorDivider: { width: 1, height: 22, marginHorizontal: 2, backgroundColor: 'rgba(10,18,34,0.10)' },
  textColorSwatch: { width: 29, height: 29, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(10,18,34,0.12)', alignItems: 'center', justifyContent: 'center' },
  textColorSwatchLight: { borderColor: 'rgba(10,18,34,0.20)' },
  pressed: { opacity: 0.62 },
  paletteItemDisabled: { opacity: 0.55 },
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
      top: 0,
      left: 10,
      right: 10,
      zIndex: 120,
      paddingHorizontal: 11,
      paddingTop: 8,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.94)',
      backgroundColor: 'rgba(255,255,255,0.94)',
      shadowColor: '#0A1222',
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    panelGrabber: {
      width: 27,
      height: 5,
      borderRadius: 3,
      backgroundColor: 'rgba(10,18,34,0.18)',
    },
    panelEyebrow: {
      marginBottom: 1,
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 8.5,
      letterSpacing: 0.65,
    },
    panelHeaderButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(10,18,34,0.06)',
    },
    selectionHint: { flex: 1, color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 9.5 },
    packSwitcher: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      padding: 4,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceSoft,
    },
    packButton: {
      flex: 1,
      minHeight: 32,
      paddingHorizontal: 8,
      borderRadius: 14,
      flexDirection: 'row',
      gap: 5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    packButtonActive: {
      backgroundColor: 'rgba(255,255,255,0.90)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(10,18,34,0.07)',
    },
    packText: { color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10.2 },
    packTextActive: { color: theme.colors.text, fontFamily: 'Manrope_700Bold' },
    clearButton: { minHeight: 29, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
    clearText: { color: '#B42318', fontFamily: 'Manrope_600SemiBold', fontSize: 9.5 },
    selectionQuickAction: {
      minHeight: 30,
      paddingHorizontal: 11,
      borderRadius: 15,
      flexDirection: 'row',
      gap: 5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(10,18,34,0.08)',
    },
    selectionQuickActionText: { color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', fontSize: 9.5 },
    editingBanner: {
      minHeight: 34,
      marginBottom: 7,
      paddingLeft: 10,
      paddingRight: 5,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.circle.accentSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: rgba(theme.circle.accent, 0.18),
    },
    editingBannerText: { flex: 1, color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', fontSize: 9.5 },
    editingCancelButton: { minHeight: 26, paddingHorizontal: 9, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.68)' },
    editingCancelText: { color: theme.colors.subtext, fontFamily: 'Manrope_700Bold', fontSize: 9 },
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
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(10,18,34,0.04)',
    },
    emojiPaletteItemActive: {
      backgroundColor: theme.circle.accentSoft,
      borderColor: rgba(theme.circle.accent, 0.36),
    },
    pickerMiniLabel: {
      color: theme.colors.subtext,
      fontFamily: 'Manrope_700Bold',
      fontSize: 8.2,
      letterSpacing: 0.6,
    },
    pickerHelperText: {
      flexShrink: 1,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 8.5,
      textAlign: 'right',
    },
    libraryTitle: {
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 11.5,
    },
    librarySubtitle: {
      marginTop: 2,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 9,
      lineHeight: 12.5,
    },
    libraryCountPill: {
      minWidth: 42,
      minHeight: 24,
      paddingHorizontal: 8,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(10,18,34,0.06)',
    },
    libraryCountText: {
      color: theme.colors.subtext,
      fontFamily: 'Manrope_700Bold',
      fontSize: 8.5,
    },
    importActionButton: {
      flex: 1,
      minHeight: 48,
      paddingHorizontal: 8,
      borderRadius: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: theme.circle.accentSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: rgba(theme.circle.accent, 0.18),
    },
    importActionIcon: {
      width: 31,
      height: 31,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.66)',
    },
    importActionTitle: {
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 9.5,
    },
    importActionSubtitle: {
      marginTop: 1,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 7.5,
    },
    libraryAssetCard: {
      width: 72,
      height: 72,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: 1.25,
      borderColor: 'rgba(10,18,34,0.055)',
      overflow: 'hidden',
    },
    libraryAssetCardActive: {
      borderWidth: 2,
      borderColor: theme.circle.accent,
      backgroundColor: theme.circle.accentSoft,
    },
    librarySourceBadge: {
      position: 'absolute',
      left: 5,
      bottom: 5,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.86)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(10,18,34,0.08)',
    },
    librarySourceBadgeApple: {
      backgroundColor: rgba(theme.circle.accent, 0.14),
      borderColor: rgba(theme.circle.accent, 0.22),
    },
    libraryEmptyState: {
      minHeight: 62,
      marginTop: 9,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(10,18,34,0.055)',
    },
    libraryEmptyIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.circle.accentSoft,
    },
    libraryEmptyTitle: {
      color: theme.colors.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 9.5,
    },
    libraryEmptyText: {
      marginTop: 1,
      color: theme.colors.subtext,
      fontFamily: 'Manrope_400Regular',
      fontSize: 8.3,
      lineHeight: 11.5,
    },
    capacityPill: {
      minHeight: 21,
      paddingHorizontal: 7,
      borderRadius: 11,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.54)',
    },
    capacityText: {
      color: theme.colors.subtext,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 8,
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
