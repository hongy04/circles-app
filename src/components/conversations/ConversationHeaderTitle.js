import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../Avatar';
import { COLORS } from '../../theme/colors';

export function ConversationHeaderTitle({
  name,
  avatarUri,
  onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name || 'Circle'} profile`}
      style={({ pressed }) => [
        styles.root,
        pressed && styles.pressed,
      ]}
    >
      <Avatar
        size={34}
        name={name || 'Circle'}
        uri={avatarUri}
      />
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>
          {name || 'Circle'}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={11}
          color={COLORS.subtext}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    minWidth: 130,
    maxWidth: 230,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  nameRow: {
    maxWidth: '100%',
    minHeight: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  name: {
    maxWidth: 190,
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    lineHeight: 14,
  },
  pressed: {
    opacity: 0.62,
  },
});
