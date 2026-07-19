import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Contacts from 'expo-contacts';
import * as Localization from 'expo-localization';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { COLORS } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { ensureAuthed } from '../../services/authService';
import { replaceWithMainTabs } from '../../navigation/navigationActions';
import { authStyles } from './authStyles';

function getRegionCode() {
  const locale = Localization.getLocales?.()?.[0];
  return locale?.regionCode || Localization?.region || 'US';
}

function normalizeToE164(raw, region) {
  try {
    const parsed = parsePhoneNumberFromString(raw, region);
    if (parsed?.isValid()) return parsed.number;
  } catch {}

  const digits = (raw || '').replace(/\D+/g, '');

  if (!digits) return null;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;

  return `+${digits}`;
}

export function ContactsPickerScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Platform.OS !== 'web');
  const [submitting, setSubmitting] = useState(false);
  const region = getRegionCode();

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    let cancelled = false;

    const loadContacts = async () => {
      try {
        const { status } = await Contacts.requestPermissionsAsync();

        if (status !== 'granted') {
          Alert.alert(
            'Contacts unavailable',
            'Contacts permission was not granted. You can sync them later.'
          );
          replaceWithMainTabs(navigation);
          return;
        }

        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
          pageSize: 2000,
        });

        if (cancelled) return;

        const mapped = (data || [])
          .filter((contact) => contact.phoneNumbers?.length)
          .map((contact) => ({
            id: contact.id,
            name: contact.name || 'Unknown',
            numbers: contact.phoneNumbers
              .map((phone) => phone.number)
              .filter(Boolean),
            selected: true,
          }));

        setItems(mapped);
      } catch (error) {
        if (!cancelled) {
          Alert.alert(
            'Could not load contacts',
            error?.message || 'Contacts could not be loaded.'
          );
          replaceWithMainTabs(navigation);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadContacts();

    return () => {
      cancelled = true;
    };
  }, [navigation]);

  const allSelected =
    items.length > 0 && items.every((item) => item.selected);

  const toggleAll = () => {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        selected: !allSelected,
      }))
    );
  };

  const toggle = (id) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, selected: !item.selected }
          : item
      )
    );
  };

  const onContinue = async () => {
    setSubmitting(true);

    try {
      await ensureAuthed();

      const phoneNumbers = new Set();

      items.forEach((item) => {
        if (!item.selected) return;

        item.numbers.forEach((number) => {
          const normalized = normalizeToE164(number, region);
          if (normalized) phoneNumbers.add(normalized);
        });
      });

      const phones = Array.from(phoneNumbers);
      const { data, error } = await supabase.rpc('upload_contacts', {
        phones,
      });

      if (error) throw error;

      navigation.replace('Syncing', {
        summary: data || { uploaded: phones.length },
      });
    } catch (error) {
      Alert.alert(
        'Could not sync contacts',
        error?.message || 'Failed to sync contacts.'
      );
      replaceWithMainTabs(navigation);
    } finally {
      setSubmitting(false);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={authStyles.root} edges={['top']}>
        <Text style={authStyles.title}>Contacts are mobile-only</Text>
        <Text style={authStyles.caption}>
          The browser cannot access your phone’s native contact list.
        </Text>

        <Pressable
          style={authStyles.primaryButton}
          onPress={() => replaceWithMainTabs(navigation)}
        >
          <Text style={authStyles.primaryButtonText}>
            Continue to Circles
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={authStyles.root} edges={['top']}>
        <ActivityIndicator />
        <Text style={[authStyles.caption, { marginTop: 8 }]}>
          Loading contacts…
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[authStyles.root, { paddingHorizontal: 16 }]}
      edges={['top']}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <Text style={authStyles.title}>Choose contacts</Text>

        <Pressable
          onPress={toggleAll}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 10,
            backgroundColor: pressed ? '#f6f6f6' : '#fff',
          })}
        >
          <View
            style={[
              authStyles.checkbox,
              allSelected && authStyles.checkboxOn,
              { marginRight: 8 },
            ]}
          >
            {allSelected ? (
              <Ionicons name="checkmark" size={14} color="#fff" />
            ) : null}
          </View>

          <Text
            style={{
              fontFamily: 'Manrope_600SemiBold',
              color: COLORS.text,
            }}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          flex: 1,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: COLORS.border,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <ScrollView>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => [
                authStyles.contactRow,
                {
                  backgroundColor: pressed ? '#f8f8f8' : COLORS.bg,
                  paddingHorizontal: 12,
                },
              ]}
            >
              <View
                style={[
                  authStyles.checkbox,
                  item.selected && authStyles.checkboxOn,
                ]}
              >
                {item.selected ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : null}
              </View>

              <Text
                style={authStyles.contactName}
                numberOfLines={1}
              >
                {item.name}
              </Text>

              <Text
                style={authStyles.contactNumbers}
                numberOfLines={1}
              >
                {item.numbers[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Pressable
        style={[authStyles.primaryButton, { marginTop: 12 }]}
        onPress={onContinue}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={authStyles.primaryButtonText}>Continue</Text>
        )}
      </Pressable>

      <Pressable
        style={{ marginTop: 10 }}
        onPress={() => replaceWithMainTabs(navigation)}
      >
        <Text style={authStyles.linkText}>Skip for now</Text>
      </Pressable>
    </SafeAreaView>
  );
}
