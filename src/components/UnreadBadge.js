import React from 'react';
import { Text, View } from 'react-native';

export function UnreadBadge({ count }) {
  return (
    <View
      style={{
        backgroundColor: '#000',
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
          color: '#fff',
          fontSize: 12,
          fontFamily: 'Manrope_700Bold',
        }}
      >
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
