import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../../components/Avatar';
import { COLORS } from '../../theme/colors';
import {
  createGroupConversation,
  listConnectedPeopleForGroup,
} from '../../services/conversationService';

export function CreateGroupScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [people, setPeople] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listConnectedPeopleForGroup();
      setPeople(rows);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load your connections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedPeople = useMemo(
    () => people.filter((person) => selectedIds.has(person.id)),
    [people, selectedIds]
  );

  const toggle = (userId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const create = async () => {
    if (selectedIds.size < 2) {
      Alert.alert(
        'Choose at least two people',
        'A group starts with you and at least two accepted connections.'
      );
      return;
    }

    setCreating(true);
    try {
      const conversationId = await createGroupConversation({
        title,
        inviteeIds: Array.from(selectedIds),
      });

      const resolvedTitle = title.trim()
        || selectedPeople.map((person) => person.displayName).join(', ')
        || 'Private group';

      navigation.replace('Chat', {
        conversationId,
        name: resolvedTitle,
        kind: 'group',
      });
    } catch (createError) {
      Alert.alert(
        'Could not create group',
        createError?.message || 'Please try again.'
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.privacyCard}>
          <Ionicons name="lock-closed-outline" size={24} color={COLORS.text} />
          <View style={styles.privacyText}>
            <Text style={styles.privacyTitle}>Invitation-only by design</Text>
            <Text style={styles.privacyBody}>
              Only accepted connections can be invited. Each person must accept
              before they can enter the chat or its shared private profile.
            </Text>
          </View>
        </View>

        <Text style={styles.label}>GROUP NAME</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Optional — names will be used automatically"
          maxLength={60}
          style={styles.input}
        />
        <Text style={styles.counter}>{title.length}/60</Text>

        <View style={styles.selectionHeader}>
          <Text style={styles.label}>INVITE CONNECTIONS</Text>
          <Text style={styles.selectedCount}>{selectedIds.size} selected</Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator />
            <Text style={styles.stateText}>Loading connections…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={load} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : people.length < 2 ? (
          <View style={styles.stateCard}>
            <Ionicons name="people-outline" size={34} color={COLORS.text} />
            <Text style={styles.emptyTitle}>Connect with two people first</Text>
            <Text style={styles.emptyBody}>
              Direct conversations appear after one accepted connection. A
              private group needs at least two people besides you.
            </Text>
          </View>
        ) : (
          <View style={styles.peopleCard}>
            {people.map((person, index) => {
              const selected = selectedIds.has(person.id);
              return (
                <View key={person.id}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    onPress={() => toggle(person.id)}
                    style={({ pressed }) => [
                      styles.personRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Avatar
                      size={46}
                      name={person.displayName}
                      uri={person.avatarUri}
                    />
                    <Text style={styles.personName} numberOfLines={1}>
                      {person.displayName}
                    </Text>
                    <View style={[
                      styles.checkbox,
                      selected && styles.checkboxSelected,
                    ]}>
                      {selected ? (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={create}
          disabled={creating || selectedIds.size < 2}
          style={({ pressed }) => [
            styles.createButton,
            selectedIds.size < 2 && styles.createButtonDisabled,
            (pressed || creating) && styles.pressed,
          ]}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>
              Send {selectedIds.size || ''} invitation{selectedIds.size === 1 ? '' : 's'}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  content: {
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 44,
  },
  privacyCard: {
    flexDirection: 'row',
    padding: 15,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    marginBottom: 24,
  },
  privacyText: {
    flex: 1,
    marginLeft: 12,
  },
  privacyTitle: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  privacyBody: {
    marginTop: 3,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    marginLeft: 4,
    marginBottom: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
  },
  counter: {
    alignSelf: 'flex-end',
    marginTop: 5,
    marginBottom: 22,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedCount: {
    marginBottom: 7,
    color: COLORS.subtext,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  peopleCard: {
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  personRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  personName: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
  },
  checkbox: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#c7c7cc',
    backgroundColor: COLORS.bg,
  },
  checkboxSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72,
    backgroundColor: COLORS.border,
  },
  stateCard: {
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 30,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  stateText: {
    marginTop: 9,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
  },
  emptyTitle: {
    marginTop: 13,
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
  },
  emptyBody: {
    marginTop: 6,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 19,
    textAlign: 'center',
  },
  errorCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff1f0',
  },
  errorText: {
    color: '#b42318',
    fontFamily: 'Manrope_400Regular',
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 9,
  },
  retryText: {
    color: '#b42318',
    fontFamily: 'Manrope_700Bold',
  },
  createButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
  },
  createButtonDisabled: {
    backgroundColor: '#c7c7cc',
  },
  createButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  pressed: {
    opacity: 0.72,
  },
});
