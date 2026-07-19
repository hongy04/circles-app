import React from 'react';
import { Image, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { getInitials } from '../utils/getInitials';

export function Avatar({ size = 64, name, uri, ripple }) {
  return (
    <View style={{ width: size, alignItems: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: '#f2f2f2',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Text style={{ fontFamily: 'Manrope_700Bold' }}>
            {getInitials(name)}
          </Text>
        )}
      </View>

      {ripple ? (
        <MotiView
          from={{ opacity: 0.35, scale: 1 }}
          animate={{ opacity: 0, scale: 1.6 }}
          transition={{ loop: true, type: 'timing', duration: 1600 }}
          style={{
            position: 'absolute',
            top: -2,
            left: size * -0.03,
            width: size * 1.06,
            height: size * 1.06,
            borderRadius: size,
            borderWidth: 2,
            borderColor: 'rgba(0,0,0,0.15)',
          }}
        />
      ) : null}
    </View>
  );
}
