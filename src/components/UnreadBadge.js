import React from 'react';
import { Text, View } from 'react-native';

import { useThemeTokens } from '../theme/ThemeProvider';

export function UnreadBadge({ count }) {
  const theme = useThemeTokens();

  return (
    <View
      style={{
        backgroundColor: theme.circle.accent,
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
      }}
    >
      <Text
        style={{
          color: theme.colors.onPrimary,
          fontSize: 12,
          fontFamily: 'Manrope_700Bold',
        }}
      >
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
