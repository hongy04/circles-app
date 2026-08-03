import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

export const MAX_DECORATION_STICKERS = 18;
export const MAX_CUSTOM_STICKER_ASSETS = 24;
export const STICKER_BASE_SIZE = 66;
export const MAX_TEXT_DECORATION_LENGTH = 60;
export const MAX_EMOJI_DECORATION_LENGTH = 24;

export const EMOJI_DECALS = [
  '🫧', '🌸', '☁️', '🌈', '🌿', '🍀', '🌊', '⭐️',
  '🌙', '☀️', '🦋', '🐚', '🍓', '🍊', '💿', '🎧',
  '🎀', '💗', '✨', '🪩', '🧸', '🐬', '🌻', '🍄',
];

export const TEXT_DECORATION_STYLES = [
  { id: 'glass', label: 'Glass' },
  { id: 'ink', label: 'Ink' },
  { id: 'soft', label: 'Soft' },
];

export const TEXT_DECORATION_COLORS = [
  '#0A1222', '#FFFFFF', '#3E8FD6', '#50B878',
  '#F06D5F', '#F2A93B', '#A777E3', '#E45C9A',
];

export const STICKER_CATALOG = [
  { id: 'aero-bubbles', label: 'Bubbles', pack: 'Aero', art: 'bubbles', colors: ['#CFF7FF', '#8EDCFF', '#8DE6C3'] },
  { id: 'aero-flower', label: 'Flower', pack: 'Aero', art: 'flower', colors: ['#FFF6A6', '#FFFFFF', '#8DE6C3'] },
  { id: 'aero-sun', label: 'Sunshine', pack: 'Aero', art: 'icon', icon: 'sunny', colors: ['#FFF8B8', '#FFC95E', '#FF9A62'] },
  { id: 'aero-cloud', label: 'Cloud', pack: 'Aero', art: 'cloud', colors: ['#FFFFFF', '#DFF5FF', '#9EDCFF'] },
  { id: 'nature-leaf', label: 'Leaf', pack: 'Nature', art: 'icon', icon: 'leaf', colors: ['#E9FFD3', '#93E37D', '#4FB36A'] },
  { id: 'nature-drop', label: 'Water', pack: 'Nature', art: 'icon', icon: 'water', colors: ['#E6FBFF', '#80DFFF', '#48A8EA'] },
  { id: 'nature-star', label: 'Star', pack: 'Nature', art: 'icon', icon: 'star', colors: ['#FFFDE3', '#FFE779', '#FFC85B'] },
  { id: 'night-moon', label: 'Moon', pack: 'Nature', art: 'icon', icon: 'moon', colors: ['#F7F2FF', '#B9B7FF', '#7882C8'] },
  { id: 'cozy-heart', label: 'Heart', pack: 'Cozy', art: 'icon', icon: 'heart', colors: ['#FFF0F4', '#FF9FB6', '#FF6F91'] },
  { id: 'cozy-music', label: 'Music', pack: 'Cozy', art: 'icon', icon: 'musical-notes', colors: ['#F5EFFF', '#C9A9FF', '#8D76DD'] },
  { id: 'cozy-smile', label: 'Smile', pack: 'Cozy', art: 'icon', icon: 'happy', colors: ['#FFF9C8', '#FFE17E', '#FFB95D'] },
  { id: 'cozy-planet', label: 'Planet', pack: 'Cozy', art: 'icon', icon: 'planet', colors: ['#E9F1FF', '#86B8FF', '#7E85DB'] },
];

const CATALOG_BY_ID = Object.fromEntries(STICKER_CATALOG.map((item) => [item.id, item]));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function normalizeCustomStickerAssets(input) {
  if (!Array.isArray(input)) return [];

  return input
    .slice(0, MAX_CUSTOM_STICKER_ASSETS)
    .filter((item) => item && String(item.id || '').trim() && (item.url || item.localUri || item.path))
    .map((item, index) => ({
      id: String(item.id || `custom-${index}`).slice(0, 80),
      path: item.path ? String(item.path) : null,
      url: item.url || item.localUri || null,
      localUri: item.localUri || null,
      mimeType: item.mimeType || item.mime_type || 'image/png',
      source: item.source === 'apple_glyph' || String(item.id || '').startsWith('apple-') ? 'apple_glyph' : 'custom_image',
    }));
}

function normalizeHexColor(value) {
  const clean = String(value || '').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(clean) ? clean : '#0A1222';
}

function normalizeDecorationKind(item) {
  const explicit = String(item?.kind || '').trim();
  if (['built_in', 'custom_image', 'emoji', 'text', 'apple_glyph'].includes(explicit)) return explicit;
  if (item?.sticker === 'custom') return 'custom_image';
  if (CATALOG_BY_ID[item?.sticker]) return 'built_in';
  return null;
}

export function normalizeStickerList(input, customAssets = []) {
  if (!Array.isArray(input)) return [];

  const customIds = new Set(normalizeCustomStickerAssets(customAssets).map((item) => item.id));

  return input
    .slice(0, MAX_DECORATION_STICKERS)
    .map((item, index) => {
      if (!item) return null;
      const kind = normalizeDecorationKind(item);
      if (!kind) return null;

      const base = {
        id: String(item.id || `sticker-${index}`).slice(0, 80),
        kind,
        x: clamp(item.x ?? 0.5, 0.04, 0.96),
        y: clamp(item.y ?? 0.5, 0.04, 0.96),
        scale: clamp(item.scale ?? 1, 0.55, 2.2),
        rotation: clamp(item.rotation ?? 0, -180, 180),
        z: clamp(item.z ?? index, 0, 50),
      };

      if (kind === 'built_in') {
        if (!CATALOG_BY_ID[item.sticker]) return null;
        return { ...base, sticker: item.sticker };
      }

      if (kind === 'custom_image' || kind === 'apple_glyph') {
        const assetId = String(item.asset_id || '');
        if (!customIds.has(assetId)) return null;
        return { ...base, sticker: 'custom', asset_id: assetId };
      }

      const content = String(item.content || '').trim();
      if (kind === 'emoji') {
        if (!content || content.length > MAX_EMOJI_DECORATION_LENGTH) return null;
        return { ...base, content };
      }

      if (!content || content.length > MAX_TEXT_DECORATION_LENGTH) return null;
      const textStyle = TEXT_DECORATION_STYLES.some((style) => style.id === item.text_style)
        ? item.text_style
        : 'glass';
      return {
        ...base,
        content,
        text_style: textStyle,
        color: normalizeHexColor(item.color),
      };
    })
    .filter(Boolean);
}

export function makeDecorationInstance(payload = {}, index = 0) {
  // New decorations should be immediately visible when added. Start them over
  // the upper profile/header area, then fan subsequent additions out slightly.
  // Users can drag them anywhere on the full normalized canvas afterward.
  const spread = [
    [0.5, 0.19],
    [0.34, 0.22],
    [0.66, 0.22],
    [0.43, 0.28],
    [0.57, 0.28],
  ];
  const [x, y] = spread[index % spread.length];
  const kind = payload.kind || 'built_in';
  const base = {
    id: `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    x,
    y,
    scale: 1,
    rotation: 0,
    z: index,
  };

  if (kind === 'custom_image' || kind === 'apple_glyph') {
    return { ...base, sticker: 'custom', asset_id: String(payload.assetId || '') };
  }
  if (kind === 'emoji') {
    return { ...base, content: String(payload.content || '🫧').trim().slice(0, MAX_EMOJI_DECORATION_LENGTH) };
  }
  if (kind === 'text') {
    return {
      ...base,
      content: String(payload.content || 'Circles').trim().slice(0, MAX_TEXT_DECORATION_LENGTH),
      text_style: TEXT_DECORATION_STYLES.some((style) => style.id === payload.textStyle) ? payload.textStyle : 'glass',
      color: normalizeHexColor(payload.color),
    };
  }
  const stickerId = CATALOG_BY_ID[payload.stickerId] ? payload.stickerId : STICKER_CATALOG[0].id;
  return { ...base, sticker: stickerId };
}

export function makeStickerInstance(stickerId, index = 0, assetId = null) {
  if (stickerId === 'custom' && assetId) {
    return makeDecorationInstance({ kind: 'custom_image', assetId }, index);
  }
  return makeDecorationInstance({ kind: 'built_in', stickerId }, index);
}

export function getDecorationRenderBox(sticker, baseSize = STICKER_BASE_SIZE) {
  const height = baseSize * clamp(sticker?.scale ?? 1, 0.55, 2.2);
  if (sticker?.kind !== 'text') return { width: height, height };
  const contentLength = Math.max(1, String(sticker.content || '').length);
  const widthFactor = clamp(1.35 + (contentLength * 0.075), 1.55, 3.15);
  return { width: height * widthFactor, height };
}

export function getSafeDecorationPosition(
  sticker,
  layout,
  proposedX = sticker?.x ?? 0.5,
  proposedY = sticker?.y ?? 0.5,
  baseSize = STICKER_BASE_SIZE,
  margin = 6
) {
  const width = Math.max(1, Number(layout?.width) || 1);
  const height = Math.max(1, Number(layout?.height) || 1);
  const box = getDecorationRenderBox(sticker, baseSize);
  const radians = ((Number(sticker?.rotation) || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const rotatedWidth = (box.width * cos) + (box.height * sin);
  const rotatedHeight = (box.width * sin) + (box.height * cos);
  const minX = clamp(((rotatedWidth / 2) + margin) / width, 0.04, 0.48);
  const minY = clamp(((rotatedHeight / 2) + margin) / height, 0.04, 0.48);

  return {
    x: clamp(proposedX, minX, 1 - minX),
    y: clamp(proposedY, minY, 1 - minY),
  };
}

function GlassIconSticker({ item, size }) {
  const iconSize = size * 0.47;
  return (
    <LinearGradient
      colors={[item.colors[0], item.colors[1], item.colors[2]]}
      locations={[0, 0.55, 1]}
      start={{ x: 0.14, y: 0.06 }}
      end={{ x: 0.86, y: 0.96 }}
      style={[styles.glassIcon, { width: size, height: size, borderRadius: size * 0.42 }]}
    >
      <View style={[styles.glassTopSheen, { borderRadius: size }]} />
      <View style={[styles.glassLowerPool, { borderRadius: size }]} />
      <Ionicons name={item.icon} size={iconSize} color="rgba(10,18,34,0.72)" />
      <View style={[styles.pinGlint, { width: size * 0.12, height: size * 0.07, borderRadius: size }]} />
    </LinearGradient>
  );
}

function BubbleSticker({ item, size }) {
  const orb = (factor, left, top, colorIndex) => (
    <LinearGradient
      key={`${factor}-${left}-${top}`}
      colors={['rgba(255,255,255,0.94)', item.colors[colorIndex], 'rgba(255,255,255,0.34)']}
      style={{
        position: 'absolute',
        width: size * factor,
        height: size * factor,
        borderRadius: size,
        left: size * left,
        top: size * top,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.86)',
        shadowColor: '#4AA6C8',
        shadowOpacity: 0.16,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      <View style={[styles.bubbleGlint, { width: size * factor * 0.22, height: size * factor * 0.11 }]} />
    </LinearGradient>
  );

  return (
    <View style={{ width: size, height: size }}>
      {orb(0.58, 0.03, 0.29, 1)}
      {orb(0.5, 0.47, 0.08, 0)}
      {orb(0.44, 0.48, 0.53, 2)}
    </View>
  );
}

function FlowerSticker({ item, size }) {
  const petalSize = size * 0.39;
  const petals = [
    { left: 0.31, top: 0.02 },
    { left: 0.57, top: 0.27 },
    { left: 0.31, top: 0.53 },
    { left: 0.05, top: 0.27 },
  ];

  return (
    <View style={{ width: size, height: size }}>
      {petals.map((petal, index) => (
        <LinearGradient
          key={index}
          colors={['rgba(255,255,255,0.95)', item.colors[index % 2], 'rgba(255,255,255,0.38)']}
          style={{
            position: 'absolute',
            width: petalSize,
            height: petalSize,
            borderRadius: petalSize * 0.48,
            left: size * petal.left,
            top: size * petal.top,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255,255,255,0.85)',
          }}
        />
      ))}
      <LinearGradient
        colors={[item.colors[0], '#FFD869']}
        style={{
          position: 'absolute',
          width: size * 0.34,
          height: size * 0.34,
          left: size * 0.33,
          top: size * 0.33,
          borderRadius: size,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: 'rgba(255,255,255,0.86)',
        }}
      />
    </View>
  );
}

function CloudSticker({ item, size }) {
  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient
        colors={[item.colors[0], item.colors[1], item.colors[2]]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.cloudBase, { width: size * 0.86, height: size * 0.42, left: size * 0.07, top: size * 0.4, borderRadius: size }]}
      />
      <View style={[styles.cloudPuff, { width: size * 0.43, height: size * 0.43, left: size * 0.15, top: size * 0.22, borderRadius: size, backgroundColor: item.colors[0] }]} />
      <View style={[styles.cloudPuff, { width: size * 0.54, height: size * 0.54, left: size * 0.38, top: size * 0.12, borderRadius: size, backgroundColor: item.colors[1] }]} />
      <View style={[styles.cloudShine, { width: size * 0.24, height: size * 0.08, borderRadius: size, left: size * 0.26, top: size * 0.31 }]} />
    </View>
  );
}

function EmojiDecoration({ content, size }) {
  return (
    <View style={[styles.emojiSticker, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.emojiStickerText, { fontSize: size * 0.72, lineHeight: size * 0.86 }]}
      >
        {content}
      </Text>
    </View>
  );
}

function TextDecoration({ content, textStyle = 'glass', color = '#0A1222', width, height }) {
  const isGlass = textStyle === 'glass';
  const isSoft = textStyle === 'soft';
  const fontSize = Math.max(12, height * (content.length > 30 ? 0.24 : content.length > 16 ? 0.29 : 0.34));
  const textColor = color;

  return (
    <View
      style={[
        styles.textSticker,
        { width, height, borderRadius: height * 0.28 },
        isGlass && styles.textStickerGlass,
        isSoft && { backgroundColor: rgbaForDecoration(color, 0.16), borderColor: rgbaForDecoration(color, 0.26) },
      ]}
    >
      {isGlass ? <View style={styles.textStickerSheen} /> : null}
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        style={[
          styles.textStickerText,
          {
            color: textColor,
            fontSize,
            lineHeight: fontSize * 1.12,
            fontFamily: textStyle === 'ink' ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
            textShadowColor: color === '#FFFFFF' ? 'rgba(10,18,34,0.42)' : 'rgba(255,255,255,0.26)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 1.5,
          },
        ]}
      >
        {content}
      </Text>
    </View>
  );
}

function rgbaForDecoration(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(10,18,34,${alpha})`;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function StickerArt({
  stickerId,
  kind = null,
  content = '',
  textStyle = 'glass',
  color = '#0A1222',
  customUrl = null,
  size = STICKER_BASE_SIZE,
  width = null,
  height = null,
}) {
  const resolvedKind = kind || (stickerId === 'custom' ? 'custom_image' : 'built_in');
  const resolvedWidth = width || size;
  const resolvedHeight = height || size;

  if ((resolvedKind === 'custom_image' || resolvedKind === 'apple_glyph') && customUrl) {
    return (
      <Image
        source={{ uri: customUrl }}
        resizeMode="contain"
        style={{ width: resolvedWidth, height: resolvedHeight }}
      />
    );
  }

  if (resolvedKind === 'emoji') {
    return <EmojiDecoration content={content || '🫧'} size={resolvedHeight} />;
  }

  if (resolvedKind === 'text') {
    return (
      <TextDecoration
        content={content || 'Circles'}
        textStyle={textStyle}
        color={color}
        width={resolvedWidth}
        height={resolvedHeight}
      />
    );
  }

  const item = CATALOG_BY_ID[stickerId] || STICKER_CATALOG[0];
  if (item.art === 'bubbles') return <BubbleSticker item={item} size={resolvedHeight} />;
  if (item.art === 'flower') return <FlowerSticker item={item} size={resolvedHeight} />;
  if (item.art === 'cloud') return <CloudSticker item={item} size={resolvedHeight} />;
  return <GlassIconSticker item={item} size={resolvedHeight} />;
}

export function StickerCanvas({ stickers, customStickers = [], style, baseSize = STICKER_BASE_SIZE }) {
  const assets = useMemo(() => normalizeCustomStickerAssets(customStickers), [customStickers]);
  const assetMap = useMemo(() => Object.fromEntries(assets.map((item) => [item.id, item])), [assets]);
  const normalized = useMemo(
    () => normalizeStickerList(stickers, assets).sort((a, b) => a.z - b.z),
    [assets, stickers]
  );
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  if (!normalized.length) return null;

  return (
    <View
      pointerEvents="none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setLayout((current) => current.width === width && current.height === height ? current : { width, height });
      }}
      style={[StyleSheet.absoluteFillObject, styles.canvas, style]}
    >
      {layout.width > 0 && layout.height > 0 ? normalized.map((sticker) => {
        const box = getDecorationRenderBox(sticker, baseSize);
        const customUrl = (sticker.kind === 'custom_image' || sticker.kind === 'apple_glyph')
          ? assetMap[sticker.asset_id]?.url
          : null;
        const safePosition = getSafeDecorationPosition(sticker, layout, sticker.x, sticker.y, baseSize);
        return (
          <View
            key={sticker.id}
            style={{
              position: 'absolute',
              width: box.width,
              height: box.height,
              left: (layout.width * safePosition.x) - (box.width / 2),
              top: (layout.height * safePosition.y) - (box.height / 2),
              transform: [{ rotate: `${sticker.rotation}deg` }],
            }}
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
          </View>
        );
      }) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { zIndex: 0 },
  emojiSticker: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0A1222',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  emojiStickerText: {
    textAlign: 'center',
  },
  textSticker: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  textStickerGlass: {
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderColor: 'rgba(255,255,255,0.90)',
    shadowColor: '#0A4664',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  textStickerSheen: {
    position: 'absolute',
    left: '8%',
    right: '18%',
    top: '8%',
    height: '24%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.40)',
    transform: [{ rotate: '-5deg' }],
  },
  textStickerText: {
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  glassIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.88)',
    shadowColor: '#0A4664',
    shadowOpacity: 0.15,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  glassTopSheen: {
    position: 'absolute',
    left: '13%',
    right: '19%',
    top: '8%',
    height: '24%',
    backgroundColor: 'rgba(255,255,255,0.48)',
    transform: [{ rotate: '-9deg' }],
  },
  glassLowerPool: {
    position: 'absolute',
    left: '8%',
    right: '6%',
    bottom: '-10%',
    height: '36%',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  pinGlint: {
    position: 'absolute',
    top: '15%',
    right: '16%',
    backgroundColor: 'rgba(255,255,255,0.86)',
    transform: [{ rotate: '-18deg' }],
  },
  bubbleGlint: {
    position: 'absolute',
    left: '18%',
    top: '16%',
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.74)',
    transform: [{ rotate: '-20deg' }],
  },
  cloudBase: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.86)',
  },
  cloudPuff: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.82)',
  },
  cloudShine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.72)',
    transform: [{ rotate: '-12deg' }],
  },
});
