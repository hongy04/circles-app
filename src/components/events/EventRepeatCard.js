import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '../Avatar';
import { useThemeTokens } from '../../theme/ThemeProvider';

function interestedCopy(count) {
  if (count === 1) return '1 person would join another gathering.';
  return `${count} people would join another gathering.`;
}

export function EventRepeatCard({
  summary,
  updating = false,
  planning = false,
  onToggle,
  onPlanAnother,
}) {
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!summary?.available) return null;

  const people = summary.interestedPeople || [];
  const count = Number(summary.interestedCount || 0);

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Ionicons name="refresh-outline" size={23} color={theme.colors.text} />
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>Let’s do this again</Text>
        <Text style={styles.body}>
          {summary.isHost
            ? (count > 0
              ? `${interestedCopy(count)} These responses are visible only to you as the host.`
              : 'No one has sent a repeat signal yet. You can still start another plan whenever it makes sense.')
            : (summary.viewerInterested
              ? 'You privately let the original host know you would join a similar gathering again.'
              : 'Privately let the original host know you would join a similar gathering again.')}
        </Text>

        {summary.isHost && people.length > 0 ? (
          <View style={styles.peopleRow}>
            <View style={styles.avatarStack}>
              {people.slice(0, 4).map((person, index) => (
                <View
                  key={`${person.displayName}-${index}`}
                  style={[styles.stackedAvatar, { marginLeft: index === 0 ? 0 : -9 }]}
                >
                  <Avatar
                    size={30}
                    name={person.displayName}
                    uri={person.avatarUri}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.peopleText} numberOfLines={2}>
              {people.slice(0, 3).map((person) => person.displayName).join(', ')}
              {people.length > 3 ? ` and ${people.length - 3} more` : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {summary.canSignal ? (
            <Pressable
              onPress={() => onToggle?.(!summary.viewerInterested)}
              disabled={updating || planning}
              style={({ pressed }) => [
                styles.signalButton,
                summary.viewerInterested && styles.signalButtonSelected,
                pressed && styles.pressed,
              ]}
            >
              {updating ? (
                <ActivityIndicator
                  size="small"
                  color={summary.viewerInterested ? '#fff' : theme.colors.text}
                />
              ) : (
                <Ionicons
                  name={summary.viewerInterested ? 'checkmark' : 'heart-outline'}
                  size={17}
                  color={summary.viewerInterested ? '#fff' : theme.colors.text}
                />
              )}
              <Text style={[
                styles.signalButtonText,
                summary.viewerInterested && styles.signalButtonTextSelected,
              ]}>
                {summary.viewerInterested ? 'I’d do this again' : 'I’d join again'}
              </Text>
            </Pressable>
          ) : null}

          {summary.isHost && onPlanAnother ? (
            <Pressable
              onPress={onPlanAnother}
              disabled={planning || updating}
              style={({ pressed }) => [styles.planButton, pressed && styles.pressed]}
            >
              {planning ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="calendar-outline" size={17} color="#fff" />
              )}
              <Text style={styles.planButtonText}>Plan another</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
  card: {
    marginTop: 12,
    padding: 16,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    gap: 12,
  },
  icon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.circle.accentSoft,
  },
  copy: { flex: 1 },
  title: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  body: {
    marginTop: 4,
    color: theme.colors.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  peopleRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  stackedAvatar: {
    borderRadius: 17,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  peopleText: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    lineHeight: 16,
  },
  actions: {
    marginTop: 13,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  signalButton: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.circle.accentSoft,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  signalButtonSelected: {
    borderColor: theme.welcome.brandInk,
    backgroundColor: theme.welcome.brandInk,
  },
  signalButtonText: {
    color: theme.colors.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  signalButtonTextSelected: { color: '#fff' },
  planButton: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: theme.welcome.brandInk,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  planButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  pressed: { opacity: 0.72 },
  });
}
