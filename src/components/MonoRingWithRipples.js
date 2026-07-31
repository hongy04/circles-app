import React from 'react';
import { StyleSheet, View } from 'react-native';

const BRAND_INK = '#0A1222';

export function MonoRingWithRipples({ size = 220 }) {
  const borderWidth = Math.max(1.8, Math.min(3.2, size * 0.026));

  return (
    <View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    backgroundColor: 'transparent',
    borderColor: BRAND_INK,
  },
});
