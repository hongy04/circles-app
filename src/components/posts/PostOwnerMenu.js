import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';

export function PostOwnerMenu({
  visible,
  busy = false,
  onClose,
  onEdit,
  onDelete,
}) {
  const confirmDelete = () => {
    if (busy) return;

    Alert.alert(
      'Delete this post?',
      'The post, its comments, likes, and uploaded media will be removed permanently.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: onDelete,
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={busy ? undefined : onClose}
    >
      <SafeAreaProvider>
        <View style={styles.root}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={busy ? undefined : onClose}
            accessibilityRole="button"
            accessibilityLabel="Close post options"
          />

          <SafeAreaView
            edges={['bottom']}
            style={styles.sheetWrap}
          >
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <Text style={styles.title}>Manage post</Text>

              <Pressable
                onPress={onEdit}
                disabled={busy}
                style={({ pressed }) => [
                  styles.action,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="create-outline" size={21} color={COLORS.text} />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionTitle}>Edit caption</Text>
                  <Text style={styles.actionSubtitle}>
                    Change the text without replacing the media.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color={COLORS.subtext} />
              </Pressable>

              <Pressable
                onPress={confirmDelete}
                disabled={busy}
                style={({ pressed }) => [
                  styles.action,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.iconCircle, styles.dangerCircle]}>
                  {busy ? (
                    <ActivityIndicator size="small" color="#c62828" />
                  ) : (
                    <Ionicons name="trash-outline" size={21} color="#c62828" />
                  )}
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.dangerTitle}>
                    {busy ? 'Deleting post…' : 'Delete post'}
                  </Text>
                  <Text style={styles.actionSubtitle}>
                    This cannot be undone.
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={onClose}
                disabled={busy}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    paddingHorizontal: Platform.OS === 'web' ? 16 : 0,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  sheetWrap: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : undefined,
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: Platform.OS === 'web' ? 22 : 0,
    borderBottomRightRadius: Platform.OS === 'web' ? 22 : 0,
    backgroundColor: COLORS.bg,
  },
  handle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  title: {
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  action: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  iconCircle: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#f1f1f1',
  },
  dangerCircle: {
    backgroundColor: '#fff1f1',
  },
  actionTextWrap: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  actionTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  dangerTitle: {
    color: '#c62828',
    fontFamily: 'Manrope_700Bold',
  },
  actionSubtitle: {
    marginTop: 2,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  cancelButton: {
    marginTop: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
  },
  cancelText: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.45,
  },
});
