import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../../theme/colors';
import {
  ACCOUNT_DELETION_CONFIRMATION,
  deleteMyAccount,
} from '../../services/accountDeletionService';

function BoundaryRow({ icon, title, body }) {
  return (
    <View style={styles.boundaryRow}>
      <View style={styles.boundaryIcon}>
        <Ionicons name={icon} size={18} color="#7a271a" />
      </View>
      <View style={styles.boundaryCopy}>
        <Text style={styles.boundaryTitle}>{title}</Text>
        <Text style={styles.boundaryBody}>{body}</Text>
      </View>
    </View>
  );
}

export function DeleteAccountScreen({ navigation }) {
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const isConfirmed = useMemo(
    () => confirmation.trim() === ACCOUNT_DELETION_CONFIRMATION,
    [confirmation]
  );

  const performDeletion = async () => {
    if (!isConfirmed || deleting) return;

    setDeleting(true);
    try {
      await deleteMyAccount(confirmation);

      const finish = () => navigation.reset({
        index: 0,
        routes: [{ name: 'Gate' }],
      });

      if (Platform.OS === 'web') {
        globalThis.alert?.('Your Circles account was deleted.');
        finish();
      } else {
        Alert.alert(
          'Account deleted',
          'Your Circles account and private identity data were deleted.',
          [{ text: 'Done', onPress: finish }],
          { cancelable: false }
        );
      }
    } catch (error) {
      Alert.alert(
        'Account deletion failed',
        error?.message || 'Please try again. Your confirmation does not need to be re-entered.'
      );
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeletion = () => {
    if (!isConfirmed || deleting) return;

    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm?.(
        'Delete your Circles account permanently? This cannot be undone.'
      );
      if (confirmed) performDeletion();
      return;
    }

    Alert.alert(
      'Delete your account permanently?',
      'This cannot be undone. Your login, profile, contacts, posts, private relationship state, and uploaded personal media will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: performDeletion,
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          disabled={deleting}
          hitSlop={10}
          style={styles.topBarSide}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Delete account</Text>
        <View style={styles.topBarSide} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={styles.content}
        >
          <View style={styles.warningCard}>
            <View style={styles.warningIcon}>
              <Ionicons name="trash-outline" size={28} color="#b42318" />
            </View>
            <Text style={styles.title}>This permanently deletes your account</Text>
            <Text style={styles.body}>
              You will lose access immediately. Circles cannot restore your profile, connections, private relationship state, posts, or personal uploads afterward.
            </Text>
          </View>

          <View style={styles.boundaryCard}>
            <BoundaryRow
              icon="person-remove-outline"
              title="Removed"
              body="Your authentication identity, profile details, username, contact matching data, connections, invitations, and private romantic state."
            />
            <View style={styles.separator} />
            <BoundaryRow
              icon="images-outline"
              title="Deleted"
              body="Your personal posts, stories, sent messages, Circle posts, comments, and media you uploaded."
            />
            <View style={styles.separator} />
            <BoundaryRow
              icon="archive-outline"
              title="Anonymized where history is shared"
              body="Events, plans, safety records, and shared factual history may retain a “Deleted account” placeholder so other people’s records remain coherent. They no longer link to a usable account."
            />
          </View>

          <View style={styles.confirmCard}>
            <Text style={styles.confirmLabel}>
              Type <Text style={styles.confirmWord}>DELETE</Text> to continue
            </Text>
            <TextInput
              value={confirmation}
              onChangeText={setConfirmation}
              editable={!deleting}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              placeholder="DELETE"
              placeholderTextColor="#a7a7a7"
              style={styles.input}
              onSubmitEditing={confirmDeletion}
            />
          </View>

          <Pressable
            disabled={!isConfirmed || deleting}
            onPress={confirmDeletion}
            style={({ pressed }) => [
              styles.deleteButton,
              (!isConfirmed || deleting) && styles.deleteButtonDisabled,
              pressed && isConfirmed && !deleting && styles.pressed,
            ]}
          >
            {deleting ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={styles.deleteButtonText}>Deleting account…</Text>
              </>
            ) : (
              <>
                <Ionicons name="trash-outline" size={19} color="#fff" />
                <Text style={styles.deleteButtonText}>Delete Account Permanently</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.footer}>
            Keep this screen open while deletion finishes. If a temporary server or storage error occurs, retrying continues the same deletion request rather than creating a second one.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#f7f7f7' },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  topBarSide: {
    width: 52,
    height: 42,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 48,
  },
  warningCard: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f0aaa5',
    backgroundColor: '#fff3f2',
    padding: 22,
  },
  warningIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffe0de',
    marginBottom: 14,
  },
  title: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 21,
    textAlign: 'center',
  },
  body: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  boundaryCard: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    overflow: 'hidden',
  },
  boundaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 15,
  },
  boundaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1f0',
    marginRight: 12,
  },
  boundaryCopy: { flex: 1 },
  boundaryTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  boundaryBody: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: 63,
  },
  confirmCard: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    padding: 16,
  },
  confirmLabel: {
    color: COLORS.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    marginBottom: 10,
  },
  confirmWord: { fontFamily: 'Manrope_700Bold', color: '#b42318' },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    backgroundColor: '#fff',
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    letterSpacing: 1.2,
    paddingHorizontal: 14,
  },
  deleteButton: {
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: '#b42318',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 18,
  },
  deleteButtonDisabled: { opacity: 0.38 },
  deleteButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.84 },
  footer: {
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 8,
  },
});
