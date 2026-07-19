import React from 'react';
import { View } from 'react-native';
import { MotiView } from 'moti';

export function MonoRingWithRipples({ size = 220 }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: 'rgba(0,0,0,0.35)',
        }}
      />

      {[1, 2, 3].map((index) => (
        <MotiView
          key={index}
          from={{ opacity: 0.25, scale: 0.9 }}
          animate={{ opacity: 0, scale: 1.25 }}
          transition={{
            loop: true,
            delay: index * 300,
            type: 'timing',
            duration: 1600,
          }}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: 'rgba(0,0,0,0.15)',
          }}
        />
      ))}
    </View>
  );
}
