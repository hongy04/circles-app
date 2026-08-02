import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { clampPostAspectRatio, normalizeCropPoint } from '../../utils/postPresentation';

export function FramedPostImage({
  uri,
  aspectRatio = 1,
  cropPoint,
  fit = 'crop',
  sourceWidth,
  sourceHeight,
  backgroundColor = '#FFFFFF',
  style,
}) {
  const [frameWidth, setFrameWidth] = useState(0);
  const ratio = clampPostAspectRatio(aspectRatio);
  const point = normalizeCropPoint(cropPoint, {
    width: sourceWidth,
    height: sourceHeight,
  });

  const geometry = useMemo(() => {
    if (!frameWidth || fit === 'full') return null;
    const frameHeight = frameWidth / ratio;
    const width = Number(point.width || sourceWidth || 0);
    const height = Number(point.height || sourceHeight || 0);
    if (!width || !height) return null;

    const sourceRatio = width / height;
    if (sourceRatio > ratio) {
      const renderedHeight = frameHeight;
      const renderedWidth = renderedHeight * sourceRatio;
      const overflow = Math.max(0, renderedWidth - frameWidth);
      return {
        width: renderedWidth,
        height: renderedHeight,
        left: -overflow * point.x,
        top: 0,
      };
    }

    const renderedWidth = frameWidth;
    const renderedHeight = renderedWidth / sourceRatio;
    const overflow = Math.max(0, renderedHeight - frameHeight);
    return {
      width: renderedWidth,
      height: renderedHeight,
      left: 0,
      top: -overflow * point.y,
    };
  }, [fit, frameWidth, point.height, point.width, point.x, point.y, ratio, sourceHeight, sourceWidth]);

  return (
    <View
      style={[styles.frame, { aspectRatio: ratio, backgroundColor }, style]}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        if (next > 0 && next !== frameWidth) setFrameWidth(next);
      }}
    >
      {fit === 'full' ? (
        <Image source={{ uri }} style={styles.fill} resizeMode="contain" />
      ) : geometry ? (
        <Image
          source={{ uri }}
          style={[
            styles.absoluteImage,
            {
              width: geometry.width,
              height: geometry.height,
              left: geometry.left,
              top: geometry.top,
            },
          ]}
          resizeMode="stretch"
        />
      ) : (
        <Image source={{ uri }} style={styles.fill} resizeMode="cover" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  absoluteImage: {
    position: 'absolute',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
});
