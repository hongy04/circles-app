import React from 'react';
import { View } from 'react-native';

import { useThemeTokens } from '../theme/ThemeProvider';

export function MonoRingWithRipples({ size = 220 }) {
  const theme = useThemeTokens();
  const borderWidth = Math.max(1.8, Math.min(3.2, size * 0.026));

  return (
    <View
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth,
        backgroundColor: 'transparent',
        borderColor: theme.welcome.brandInk,
      }}
    />
  );
}
