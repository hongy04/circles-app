import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../theme/colors';

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  secondary = false,
  destructive = false,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        secondary && styles.secondaryButton,
        destructive && styles.destructiveButton,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={secondary || destructive ? COLORS.text : '#fff'}
        />
      ) : null}
      <Text style={[
        styles.actionButtonText,
        (secondary || destructive) && styles.secondaryButtonText,
        destructive && styles.destructiveButtonText,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function TwoPersonCircleProposalCard({
  profile,
  status,
  busy,
  onPropose,
  onAccept,
  onNotYet,
  onEndFocus,
  onOpenCircle,
}) {
  if (!status?.available && !status?.accepted && !status?.existingCircle) {
    return null;
  }

  const firstName = (profile?.display_name || 'They')
    .trim()
    .split(/\s+/)[0];
  const state = status?.state || 'unavailable';
  const reopening = Boolean(status?.reopening || status?.existingCircle);

  let title = reopening
    ? 'Open Our Circle again?'
    : 'Create a Circle together';
  let body = reopening
    ? 'Your shared history is preserved and locked. Reopening it requires a fresh mutual decision.'
    : 'A two-person Circle is a shared private home you both choose deliberately.';
  let icon = reopening ? 'lock-open-outline' : 'ellipse-outline';

  if (state === 'locked') {
    title = 'Our Circle is closed';
    body = 'Your shared posts, Timeline, photo, and quiet messages are preserved but unavailable. Fresh Mutual Interest and Mutual Focus are required before either person can ask to reopen it.';
    icon = 'lock-closed-outline';
  } else if (state === 'reopen_available') {
    title = 'Open Our Circle again?';
    body = 'You are focusing on each other again. Either person may privately propose reopening the preserved shared space.';
    icon = 'refresh-circle-outline';
  } else if (state === 'pending_outgoing') {
    title = reopening ? 'Reopening proposal sent' : 'Circle proposal sent';
    body = reopening
      ? `${firstName} can choose Open Our Circle, Not yet, or End Focus. The preserved Circle stays locked until they choose.`
      : `${firstName} can choose Create our Circle, Not yet, or End Focus. There are no reminders or repeat requests.`;
    icon = 'paper-plane-outline';
  } else if (state === 'pending_incoming') {
    title = reopening
      ? `${firstName} wants to open Our Circle again.`
      : `${firstName} wants to create a Circle with you.`;
    body = reopening
      ? 'This restores the preserved shared space. It is a separate choice from Mutual Focus.'
      : 'This is a separate choice from Mutual Focus. Choose what feels right now.';
    icon = 'heart-circle-outline';
  } else if (state === 'not_yet_can_propose') {
    title = 'The next proposal is yours';
    body = reopening
      ? 'You chose Not yet earlier. Only you can decide when—or whether—to ask to reopen the shared Circle.'
      : 'You chose Not yet earlier. Only you can decide when—or whether—to ask again.';
    icon = 'time-outline';
  } else if (state === 'not_yet_waiting') {
    title = 'Not yet';
    body = `${firstName} holds the next proposal right. Circles will not remind or pressure either of you.`;
    icon = 'time-outline';
  } else if (state === 'accepted') {
    title = 'Your Circle is open';
    body = 'The shared profile, posts, Timeline, and quiet messages are available to the two of you.';
    icon = 'infinite-outline';
  }

  const canPropose = state === 'none'
    || state === 'reopen_available'
    || state === 'not_yet_can_propose';

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.iconWrap}>
          {busy ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Ionicons name={icon} size={21} color={COLORS.text} />
          )}
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
      </View>

      {canPropose ? (
        <View style={styles.actions}>
          <ActionButton
            label={reopening ? 'Propose reopening' : 'Propose a Circle'}
            icon={reopening ? 'lock-open-outline' : 'ellipse-outline'}
            onPress={onPropose}
            disabled={busy || !status?.canPropose}
          />
        </View>
      ) : null}

      {state === 'pending_incoming' ? (
        <View style={styles.actionsStack}>
          <ActionButton
            label={reopening ? 'Open Our Circle' : 'Create our Circle'}
            icon="checkmark-circle-outline"
            onPress={onAccept}
            disabled={busy}
          />
          <View style={styles.secondaryActions}>
            <ActionButton
              label="Not yet"
              icon="time-outline"
              onPress={onNotYet}
              disabled={busy}
              secondary
            />
            <ActionButton
              label="End Focus"
              icon="close-circle-outline"
              onPress={onEndFocus}
              disabled={busy}
              destructive
            />
          </View>
        </View>
      ) : null}

      {state === 'accepted' ? (
        <View style={styles.actions}>
          <ActionButton
            label="Open our Circle"
            icon="arrow-forward-circle-outline"
            onPress={onOpenCircle}
            disabled={busy || !status?.conversationId}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 18,
    marginBottom: 16,
    padding: 15,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: '#f7f7fb',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ececf5',
  },
  copy: {
    flex: 1,
    marginLeft: 11,
  },
  title: {
    color: COLORS.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  body: {
    marginTop: 4,
    color: COLORS.subtext,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 17,
  },
  actions: {
    marginTop: 14,
  },
  actionsStack: {
    marginTop: 14,
    gap: 8,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  destructiveButton: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e7b9b3',
  },
  actionButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12.5,
  },
  secondaryButtonText: {
    color: COLORS.text,
  },
  destructiveButtonText: {
    color: '#a3342b',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.55,
  },
});
