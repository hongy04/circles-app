import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { FramedPostImage } from './FramedPostImage';
import {
  POST_FRAME_PRESETS,
  clamp,
  makeDefaultMediaPresentation,
  naturalPostAspectRatio,
  normalizeMediaPresentation,
} from '../../utils/postPresentation';

function mediaKind(asset) {
  return asset?.mediaType || asset?.type || 'image';
}

function CropCanvas({ asset, presentation, onChange }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [resolvedSize, setResolvedSize] = useState(null);
  const point = normalizeMediaPresentation(presentation, {
    ...asset,
    width: asset?.width || resolvedSize?.width,
    height: asset?.height || resolvedSize?.height,
  });
  const pointRef = useRef(point);
  pointRef.current = point;
  const startRef = useRef(point);

  useEffect(() => {
    if (mediaKind(asset) !== 'image' || !asset?.uri || (point.width && point.height)) return undefined;
    let cancelled = false;
    Image.getSize(asset.uri, (width, height) => {
      if (cancelled || !width || !height) return;
      setResolvedSize({ width, height });
      onChange?.({ ...pointRef.current, width, height });
    }, () => {});
    return () => { cancelled = true; };
  }, [asset?.uri, point.height, point.width]);

  const geometry = useMemo(() => {
    if (!layout.width || !layout.height || !point.width || !point.height) return null;
    const sourceRatio = point.width / point.height;
    const frameRatio = layout.width / layout.height;
    if (sourceRatio > frameRatio) {
      const height = layout.height;
      const width = height * sourceRatio;
      return { width, height, overflowX: Math.max(0, width - layout.width), overflowY: 0 };
    }
    const width = layout.width;
    const height = width / sourceRatio;
    return { width, height, overflowX: 0, overflowY: Math.max(0, height - layout.height) };
  }, [layout.height, layout.width, point.height, point.width]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => mediaKind(asset) === 'image' && point.fit === 'crop',
    onStartShouldSetPanResponderCapture: () => mediaKind(asset) === 'image' && point.fit === 'crop',
    onMoveShouldSetPanResponder: () => mediaKind(asset) === 'image' && point.fit === 'crop',
    onMoveShouldSetPanResponderCapture: () => mediaKind(asset) === 'image' && point.fit === 'crop',
    onPanResponderGrant: () => { startRef.current = pointRef.current; },
    onPanResponderMove: (_, gesture) => {
      if (!geometry) return;
      const start = startRef.current;
      onChange?.({
        ...start,
        x: geometry.overflowX ? clamp(start.x - gesture.dx / geometry.overflowX, 0, 1) : start.x,
        y: geometry.overflowY ? clamp(start.y - gesture.dy / geometry.overflowY, 0, 1) : start.y,
      });
    },
    onPanResponderTerminationRequest: () => false,
  }), [asset, geometry, onChange, point.fit]);

  const maxWidth = Math.min(windowWidth - 32, 620);
  const maxHeight = Math.max(180, windowHeight - 190);
  let frameWidth = maxWidth;
  let frameHeight = frameWidth / point.aspectRatio;
  if (frameHeight > maxHeight) {
    frameHeight = maxHeight;
    frameWidth = frameHeight * point.aspectRatio;
  }
  const actualRatio = point.aspectRatio;
  const rendered = geometry ? {
    left: geometry.overflowX ? -geometry.overflowX * point.x : 0,
    top: geometry.overflowY ? -geometry.overflowY * point.y : 0,
  } : { left: 0, top: 0 };

  return (
    <View
      {...panResponder.panHandlers}
      onLayout={(event) => {
        const next = event.nativeEvent.layout;
        setLayout({ width: next.width, height: next.height });
      }}
      style={[styles.cropCanvas, { width: frameWidth, aspectRatio: actualRatio }]}
    >
      {point.fit === 'full' ? (
        <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      ) : geometry ? (
        <Image
          source={{ uri: asset.uri }}
          resizeMode="stretch"
          style={{
            position: 'absolute',
            width: geometry.width,
            height: geometry.height,
            left: rendered.left,
            top: rendered.top,
          }}
        />
      ) : (
        <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      {point.fit === 'crop' ? (
        <View pointerEvents="none" style={styles.cropHint}>
          <Ionicons name="move-outline" size={16} color="#fff" />
          <Text style={styles.cropHintText}>Drag to reposition</Text>
        </View>
      ) : null}
    </View>
  );
}

export function PostFrameEditor({
  assets,
  presentationById,
  onPresentationChange,
  disabled = false,
}) {
  const theme = useThemeTokens();
  const stylesForTheme = useMemo(() => createThemeStyles(theme), [theme]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cropOpen, setCropOpen] = useState(false);
  const selectedAsset = assets?.[Math.min(selectedIndex, Math.max(0, (assets?.length || 1) - 1))];

  useEffect(() => {
    if (selectedIndex >= (assets?.length || 0)) setSelectedIndex(0);
  }, [assets?.length, selectedIndex]);

  if (!assets?.length || !selectedAsset) return null;

  const active = normalizeMediaPresentation(
    presentationById?.[selectedAsset.id] || makeDefaultMediaPresentation(selectedAsset),
    selectedAsset
  );
  const naturalRatio = naturalPostAspectRatio(selectedAsset);
  const options = [
    { id: 'full', label: 'Full', aspectRatio: naturalRatio, fit: 'full' },
    ...POST_FRAME_PRESETS,
  ];

  const setOption = (option) => {
    onPresentationChange?.(selectedAsset.id, {
      ...active,
      aspectRatio: option.aspectRatio,
      fit: option.fit,
      x: 0.5,
      y: 0.5,
    });
  };

  return (
    <View style={[stylesForTheme.card, { borderColor: theme.colors.border }]}> 
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Frame each photo</Text>
      <Text style={[styles.sectionBody, { color: theme.colors.subtext }]}>Each carousel item can have its own shape. Choose Full to keep the entire image, or crop it independently.</Text>

      {assets.length > 1 ? (
        <View style={styles.assetStrip}>
          {assets.map((asset, index) => {
            const selected = index === selectedIndex;
            const itemPresentation = normalizeMediaPresentation(presentationById?.[asset.id], asset);
            return (
              <Pressable
                key={asset.id}
                onPress={() => setSelectedIndex(index)}
                disabled={disabled}
                style={[
                  stylesForTheme.assetThumbWrap,
                  selected && { borderColor: theme.circle.accent },
                ]}
              >
                {mediaKind(asset) === 'image' ? (
                  <Image source={{ uri: asset.uri }} style={styles.assetThumb} />
                ) : (
                  <View style={[styles.assetThumb, styles.assetVideo]}><Ionicons name="play" size={18} color="#fff" /></View>
                )}
                <View style={[styles.assetNumber, { backgroundColor: selected ? theme.circle.accent : 'rgba(0,0,0,0.68)' }]}>
                  <Text style={styles.assetNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.assetShapeBadge}>
                  <Text style={styles.assetShapeText}>{itemPresentation.fit === 'full' ? 'Full' : itemPresentation.aspectRatio < 0.95 ? '4:5' : itemPresentation.aspectRatio > 1.2 ? 'Wide' : '1:1'}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.frameOptions}>
        {options.map((option) => {
          const selected = active.fit === option.fit && Math.abs(active.aspectRatio - option.aspectRatio) < 0.02;
          return (
            <Pressable
              key={option.id}
              onPress={() => setOption(option)}
              disabled={disabled}
              style={({ pressed }) => [
                stylesForTheme.frameOption,
                selected && { borderColor: theme.circle.accent, backgroundColor: theme.circle.accentSoft },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.frameIcon, { aspectRatio: option.aspectRatio, borderColor: selected ? theme.circle.accent : theme.colors.subtext }]} />
              <Text style={[styles.frameOptionText, { color: theme.colors.text }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.inlinePreview, { borderColor: theme.colors.border }]}>
        <FramedPostImage
          uri={selectedAsset.uri}
          aspectRatio={active.aspectRatio}
          fit={active.fit}
          cropPoint={active}
          sourceWidth={active.width}
          sourceHeight={active.height}
        />
      </View>

      {mediaKind(selectedAsset) === 'image' && active.fit === 'crop' ? (
        <Pressable
          onPress={() => setCropOpen(true)}
          disabled={disabled}
          style={({ pressed }) => [stylesForTheme.adjustButton, pressed && styles.pressed]}
        >
          <Ionicons name="crop-outline" size={18} color={theme.colors.text} />
          <Text style={[styles.adjustButtonText, { color: theme.colors.text }]}>Adjust this crop</Text>
        </Pressable>
      ) : null}

      <Text style={[styles.footerNote, { color: theme.colors.subtext }]}>This exact framing is used everywhere the post appears.</Text>

      <Modal visible={cropOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setCropOpen(false)}>
        <SafeAreaView style={styles.cropModalRoot}>
          <View style={styles.cropModalHeader}>
            <Pressable onPress={() => setCropOpen(false)} hitSlop={10}><Text style={styles.cropModalAction}>Cancel</Text></Pressable>
            <Text style={styles.cropModalTitle}>Adjust photo {selectedIndex + 1}</Text>
            <Pressable onPress={() => setCropOpen(false)} hitSlop={10}><Text style={styles.cropModalDone}>Done</Text></Pressable>
          </View>
          <View style={styles.cropModalBody}>
            <CropCanvas
              asset={selectedAsset}
              presentation={active}
              onChange={(next) => onPresentationChange?.(selectedAsset.id, next)}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function createThemeStyles(theme) {
  return StyleSheet.create({
    card: { marginTop: 18, padding: 14, borderWidth: 1, borderRadius: 16, backgroundColor: theme.colors.surface },
    frameOption: { minWidth: 72, minHeight: 58, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: theme.colors.surface },
    assetThumbWrap: { width: 62, height: 62, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
    adjustButton: { marginTop: 10, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  });
}

const styles = StyleSheet.create({
  sectionTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  sectionBody: { marginTop: 4, fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 18 },
  frameOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  frameIcon: { height: 24, borderWidth: 1.4, borderRadius: 3 },
  frameOptionText: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  assetStrip: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  assetThumb: { width: '100%', height: '100%', resizeMode: 'cover' },
  assetVideo: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  assetNumber: { position: 'absolute', top: 4, left: 4, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  assetNumberText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 10 },
  assetShapeBadge: { position: 'absolute', right: 3, bottom: 3, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.68)' },
  assetShapeText: { color: '#fff', fontFamily: 'Manrope_600SemiBold', fontSize: 8 },
  inlinePreview: { width: '100%', marginTop: 12, overflow: 'hidden', borderWidth: 1, borderRadius: 14, backgroundColor: '#111' },
  adjustButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  footerNote: { marginTop: 10, fontFamily: 'Manrope_400Regular', fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.7 },
  cropModalRoot: { flex: 1, backgroundColor: '#05070A' },
  cropModalHeader: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.18)' },
  cropModalTitle: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 15 },
  cropModalAction: { color: 'rgba(255,255,255,0.78)', fontFamily: 'Manrope_600SemiBold', fontSize: 14 },
  cropModalDone: { color: '#7EDBFF', fontFamily: 'Manrope_700Bold', fontSize: 14 },
  cropModalBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 24 },
  cropCanvas: { overflow: 'hidden', backgroundColor: '#111', borderRadius: 16 },
  cropHint: { position: 'absolute', bottom: 12, alignSelf: 'center', left: '30%', right: '30%', minHeight: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.58)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  cropHintText: { color: '#fff', fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
});
