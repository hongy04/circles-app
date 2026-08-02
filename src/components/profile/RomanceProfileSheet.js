import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeTokens } from '../../theme/ThemeProvider';

function firstName(profile) {
  return (profile?.display_name || 'them').trim().split(/\s+/)[0];
}

function proposalCopy(profile, status) {
  const name = firstName(profile);
  const state = status?.state || 'unavailable';
  const reopening = Boolean(status?.reopening || status?.existingCircle);

  if (state === 'accepted') {
    return {
      title: 'Our Circle is open',
      body: 'Your private shared Circle is available whenever you want to open it.',
    };
  }
  if (state === 'pending_incoming') {
    return {
      title: reopening ? `${name} wants to reopen Our Circle` : `${name} wants to open Our Circle`,
      body: reopening
        ? 'Your preserved shared space stays locked until you both choose to reopen it.'
        : 'Opening Our Circle is a separate mutual choice from Mutual Focus.',
    };
  }
  if (state === 'pending_outgoing') {
    return {
      title: reopening ? 'Reopening proposal sent' : 'Our Circle proposal sent',
      body: `${name} can decide privately. Circles will not send reminders or pressure either of you.`,
    };
  }
  if (state === 'not_yet_waiting') {
    return {
      title: 'Our Circle · Not yet',
      body: `${name} holds the next proposal right. There are no automatic reminders.`,
    };
  }
  if (state === 'not_yet_can_propose') {
    return {
      title: 'Our Circle · Your choice',
      body: 'You hold the next proposal right and can choose if or when to ask again.',
    };
  }
  if (state === 'reopen_available') {
    return {
      title: 'Our Circle can reopen',
      body: 'Your shared history is preserved. Reopening it requires a fresh mutual decision.',
    };
  }
  if (status?.available) {
    return {
      title: reopening ? 'Our Circle can reopen' : 'Our Circle',
      body: reopening
        ? 'Your preserved shared space can reopen only when you both choose it.'
        : 'You can create a private two-person Circle only when you both deliberately choose it.',
    };
  }
  return null;
}

function SheetAction({ label, icon, onPress, disabled, primary = false, danger = false }) {
  const theme = useThemeTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        primary && { backgroundColor: theme.circle.accent },
        danger && styles.dangerAction,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={primary ? theme.colors.onPrimary : danger ? '#b53a45' : theme.colors.text}
      />
      <Text
        style={[
          styles.actionText,
          { color: primary ? theme.colors.onPrimary : danger ? '#b53a45' : theme.colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function RomanceProfileSheet({
  visible,
  profile,
  romanticStatus,
  proposalStatus,
  busy = false,
  onClose,
  onInterestPress,
  onFocusPress,
  onPropose,
  onAccept,
  onNotYet,
  onEndFocus,
  onOpenCircle,
}) {
  const theme = useThemeTokens();
  const name = firstName(profile);
  const mutual = Boolean(romanticStatus?.mutualRevealed);
  const selected = Boolean(romanticStatus?.selectedByMe);
  const focusSelected = Boolean(romanticStatus?.focusSelectedByMe);
  const focusActive = Boolean(romanticStatus?.focusActive);
  const focusLike = focusActive || focusSelected;
  const circleCopy = proposalCopy(profile, proposalStatus);
  const state = proposalStatus?.state || 'unavailable';
  const reopening = Boolean(proposalStatus?.reopening || proposalStatus?.existingCircle);

  const title = focusActive
    ? 'Mutual Focus'
    : focusSelected
      ? 'Focus selected privately'
      : mutual
        ? 'Mutual Interest'
        : selected
          ? 'Private romantic interest'
          : 'Open to romance';

  const body = focusActive
    ? `You and ${name} are focusing on each other. Romantic discovery with other connections is paused while Focus is active.`
    : focusSelected
      ? `Your Focus choice stays private unless ${name} independently chooses Focus too.`
      : mutual
        ? `You both chose each other privately. Focus is a separate choice and only becomes active if you both choose it.`
        : selected
          ? `Only you can see this choice unless ${name} independently chooses you too.`
          : `You can privately choose ${name}. Nothing is revealed unless the interest becomes mutual.`;

  const closeThen = (callback) => () => {
    onClose?.();
    setTimeout(() => callback?.(), 150);
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
            accessibilityLabel="Close relationship details"
          />
          <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
            <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}> 
              <View style={styles.handle} />
              <View style={styles.headingRow}>
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: focusLike ? '#EEE9FF' : '#FFF0F3' },
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={theme.colors.text} />
                  ) : (
                    <Ionicons
                      name={focusLike ? 'infinite' : selected || mutual ? 'heart' : 'heart-outline'}
                      size={22}
                      color={focusLike ? '#6758C8' : '#C95A70'}
                    />
                  )}
                </View>
                <View style={styles.headingCopy}>
                  <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
                  <Text style={[styles.body, { color: theme.colors.subtext }]}>{body}</Text>
                </View>
              </View>

              {circleCopy ? (
                <View style={[styles.circleContext, { backgroundColor: theme.colors.surfaceSoft }]}> 
                  <View style={styles.circleContextTitleRow}>
                    <Ionicons name="ellipse-outline" size={15} color={theme.colors.text} />
                    <Text style={[styles.circleContextTitle, { color: theme.colors.text }]}>
                      {circleCopy.title}
                    </Text>
                  </View>
                  <Text style={[styles.circleContextBody, { color: theme.colors.subtext }]}>
                    {circleCopy.body}
                  </Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                {state === 'accepted' && proposalStatus?.conversationId ? (
                  <SheetAction
                    label="Open Our Circle"
                    icon="arrow-forward-circle-outline"
                    onPress={closeThen(onOpenCircle)}
                    disabled={busy}
                    primary
                  />
                ) : null}

                {state === 'pending_incoming' ? (
                  <>
                    <SheetAction
                      label={reopening ? 'Open Our Circle' : 'Create Our Circle'}
                      icon="checkmark-circle-outline"
                      onPress={closeThen(onAccept)}
                      disabled={busy}
                      primary
                    />
                    <View style={styles.actionRow}>
                      <View style={styles.actionHalf}>
                        <SheetAction
                          label="Not yet"
                          icon="time-outline"
                          onPress={closeThen(onNotYet)}
                          disabled={busy}
                        />
                      </View>
                      <View style={styles.actionHalf}>
                        <SheetAction
                          label="End Focus"
                          icon="close-circle-outline"
                          onPress={closeThen(onEndFocus)}
                          disabled={busy}
                          danger
                        />
                      </View>
                    </View>
                  </>
                ) : null}

                {(state === 'none' || state === 'reopen_available' || state === 'not_yet_can_propose')
                  && proposalStatus?.canPropose ? (
                  <SheetAction
                    label={reopening ? 'Propose reopening Our Circle' : 'Propose Our Circle'}
                    icon={reopening ? 'lock-open-outline' : 'ellipse-outline'}
                    onPress={closeThen(onPropose)}
                    disabled={busy}
                  />
                ) : null}

                {mutual && romanticStatus?.focusAvailable && !focusActive ? (
                  <SheetAction
                    label={focusSelected ? 'Review private Focus choice' : 'Choose Focus privately'}
                    icon={focusSelected ? 'infinite-outline' : 'radio-button-on-outline'}
                    onPress={closeThen(onFocusPress)}
                    disabled={busy}
                  />
                ) : null}

                {focusActive ? (
                  <SheetAction
                    label="Focus options"
                    icon="infinite-outline"
                    onPress={closeThen(onFocusPress)}
                    disabled={busy}
                  />
                ) : (
                  <SheetAction
                    label={mutual ? 'Mutual Interest options' : selected ? 'Private interest options' : `Choose ${name} privately`}
                    icon={selected || mutual ? 'heart' : 'heart-outline'}
                    onPress={closeThen(onInterestPress)}
                    disabled={busy}
                  />
                )}
              </View>

              <Pressable
                onPress={onClose}
                disabled={busy}
                style={({ pressed }) => [
                  styles.closeButton,
                  { backgroundColor: theme.colors.surfaceSoft },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.closeText, { color: theme.colors.text }]}>Done</Text>
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
    backgroundColor: 'rgba(10,18,34,0.28)',
  },
  sheetWrap: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : undefined,
  },
  sheet: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: Platform.OS === 'web' ? 24 : 0,
    borderBottomRightRadius: Platform.OS === 'web' ? 24 : 0,
  },
  handle: {
    width: 36,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: 'rgba(10,18,34,0.13)',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingCopy: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
  body: {
    marginTop: 4,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
  },
  circleContext: {
    marginTop: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
  },
  circleContextTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  circleContextTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12.5,
  },
  circleContextBody: {
    marginTop: 4,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
  },
  actions: {
    marginTop: 14,
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionHalf: {
    flex: 1,
  },
  action: {
    minHeight: 44,
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#F2F4F6',
  },
  actionText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    textAlign: 'center',
  },
  dangerAction: {
    backgroundColor: '#FFF1F2',
  },
  closeButton: {
    minHeight: 44,
    marginTop: 12,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.68,
  },
  disabled: {
    opacity: 0.45,
  },
});
