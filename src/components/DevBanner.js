import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function DevBanner() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: Math.max(insets.top * 0.3, 2),
        paddingBottom: 6,
        paddingHorizontal: 12,
        backgroundColor: '#111',
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          textAlign: 'center',
          color: '#fff',
          fontFamily: 'Manrope_700Bold',
          fontSize: 11,
        }}
      >
        MOCK MODE (no session)
      </Text>
    </View>
  );
}
