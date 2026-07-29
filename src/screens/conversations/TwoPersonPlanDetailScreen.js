import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../../theme/colors';
import {
  completeTwoPersonPlan,
  deleteTwoPersonPlan,
  getTwoPersonPlan,
  respondToTwoPersonPlan,
  subscribeToTwoPersonPlanChanges,
} from '../../services/twoPersonPlanService';

function formatDateTime(value) {
  if (!value) return 'No date chosen yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusDetails(plan) {
  if (plan.status === 'completed') {
    return {
      icon: 'sparkles',
      label: 'Shared memory',
      body: 'You completed this plan together. It now stays in Plans and the Circle Timeline.',
    };
  }
  if (plan.status === 'scheduled') {
    return {
      icon: 'checkmark-circle',
      label: 'Scheduled together',
      body: `${plan.acceptedByName || 'The other person'} accepted this version.`,
    };
  }
  if (plan.status === 'proposed') {
    if (plan.responseState === 'tentative') {
      return {
        icon: 'help-circle',
        label: 'Tentative',
        body: plan.isProposalMine
          ? 'The other person may be able to make it. You can keep this proposal or suggest a new version.'
          : 'You marked this proposal tentative. You can still accept it or suggest changes.',
      };
    }
    return {
      icon: 'paper-plane',
      label: 'Proposal waiting',
      body: plan.isProposalMine
        ? 'Your proposed date and place are waiting for the other person.'
        : `${plan.proposalByName || 'The other person'} proposed this version for you to respond to.`,
    };
  }
  return {
    icon: 'bulb-outline',
    label: 'Shared idea',
    body: 'This is only an idea until one of you proposes a date and the other accepts it.',
  };
}

function DetailRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={17} color={COLORS.text} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

export function TwoPersonPlanDetailScreen({ route, navigation }) {
  const {
    planId,
    conversationId,
    circleName = 'Our Circle',
  } = route.params || {};
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [showCompletion, setShowCompletion] = useState(false);
  const [memoryNote, setMemoryNote] = useState('');
  const scrollRef = useRef(null);

  const revealCompletionEditor = () => {
    setShowCompletion(true);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 180);
  };

  const keepCompletionVisible = (event) => {
    const target = event?.nativeEvent?.target;
    if (!target) return;

    setTimeout(() => {
      const responder = scrollRef.current?.getScrollResponder?.();
      responder?.scrollResponderScrollNativeHandleToKeyboard?.(target, 24, true);
    }, Platform.OS === 'ios' ? 120 : 180);
  };

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!planId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const nextPlan = await getTwoPersonPlan(planId);
      setPlan(nextPlan);
      setMemoryNote(nextPlan.memoryNote || '');
      navigation.setOptions({ title: nextPlan.status === 'completed' ? 'Memory' : 'Plan' });
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this shared plan.');
    } finally {
      setLoading(false);
    }
  }, [navigation, planId]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  useEffect(() => {
    if (!conversationId) return undefined;
    return subscribeToTwoPersonPlanChanges({
      conversationId,
      onChange: () => load({ quiet: true }),
    });
  }, [conversationId, load]);

  const respond = async (action) => {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      setPlan(await respondToTwoPersonPlan(planId, action));
    } catch (actionError) {
      setError(actionError?.message || 'Could not update this proposal.');
    } finally {
      setWorking(false);
    }
  };

  const complete = async () => {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      setPlan(await completeTwoPersonPlan(planId, memoryNote));
      setShowCompletion(false);
    } catch (actionError) {
      setError(actionError?.message || 'Could not complete this plan.');
    } finally {
      setWorking(false);
    }
  };

  const remove = () => {
    Alert.alert(
      'Remove this plan?',
      'This removes the shared idea or proposal for both people. Completed memories cannot be removed here.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (working) return;
            setWorking(true);
            try {
              await deleteTwoPersonPlan(planId);
              navigation.goBack();
            } catch (removeError) {
              setError(removeError?.message || 'Could not remove this plan.');
              setWorking(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening plan…</Text>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={38} color={COLORS.subtext} />
        <Text style={styles.errorState}>{error || 'This plan is unavailable.'}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const status = statusDetails(plan);
  const canDelete = ['idea', 'proposed'].includes(plan.status);
  const canSuggestChanges = plan.status === 'proposed';

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.contextRow}>
          <Ionicons name="lock-closed" size={11} color={COLORS.subtext} />
          <Text style={styles.contextText}>{circleName} · private to the two of you</Text>
        </View>

        <Text style={styles.title}>{plan.title}</Text>

        <View style={styles.statusCard}>
          <View style={styles.statusIcon}>
            <Ionicons name={status.icon} size={22} color={COLORS.text} />
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{status.label}</Text>
            <Text style={styles.statusBody}>{status.body}</Text>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <DetailRow icon="calendar-outline" label="When" value={plan.startsAt ? formatDateTime(plan.startsAt) : null} />
          <DetailRow icon="location-outline" label="Where" value={plan.locationName} />
          <DetailRow icon="document-text-outline" label="Notes" value={plan.note} />
          {plan.status === 'completed' ? (
            <DetailRow
              icon="heart-outline"
              label="What you kept"
              value={plan.memoryNote || 'A completed plan you chose to preserve together.'}
            />
          ) : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {plan.status === 'idea' ? (
          <View style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>What happens next?</Text>
            <Pressable
              onPress={() => navigation.navigate('TwoPersonPlanEditor', {
                conversationId,
                circleName,
                planId,
                initialAction: 'idea',
              })}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="create-outline" size={17} color={COLORS.text} />
              <Text style={styles.secondaryButtonText}>Edit Idea</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('TwoPersonPlanEditor', {
                conversationId,
                circleName,
                planId,
                initialAction: 'propose',
              })}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="calendar-outline" size={17} color="#fff" />
              <Text style={styles.primaryButtonText}>Propose a Date</Text>
            </Pressable>
          </View>
        ) : null}

        {plan.status === 'proposed' && plan.canRespond ? (
          <View style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>How does this feel?</Text>
            <Pressable
              onPress={() => respond('accept')}
              disabled={working}
              style={({ pressed }) => [styles.primaryButton, (pressed || working) && styles.pressed]}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Accept and Schedule</Text>
            </Pressable>
            <Pressable
              onPress={() => respond('tentative')}
              disabled={working}
              style={({ pressed }) => [styles.secondaryButton, (pressed || working) && styles.pressed]}
            >
              <Ionicons name="help-outline" size={17} color={COLORS.text} />
              <Text style={styles.secondaryButtonText}>Mark Tentative</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('TwoPersonPlanEditor', {
                conversationId,
                circleName,
                planId,
                initialAction: 'propose',
              })}
              style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
            >
              <Text style={styles.linkButtonText}>Suggest changes instead</Text>
            </Pressable>
          </View>
        ) : null}

        {canSuggestChanges && !plan.canRespond ? (
          <View style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>
              {plan.responseState === 'tentative' ? 'They marked it tentative' : 'Waiting for their response'}
            </Text>
            <Text style={styles.actionsBody}>
              You can leave this version open or suggest a new date, place, or note.
            </Text>
            <Pressable
              onPress={() => navigation.navigate('TwoPersonPlanEditor', {
                conversationId,
                circleName,
                planId,
                initialAction: 'propose',
              })}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="create-outline" size={17} color={COLORS.text} />
              <Text style={styles.secondaryButtonText}>Edit Proposal</Text>
            </Pressable>
          </View>
        ) : null}

        {plan.status === 'scheduled' ? (
          <View style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>After you do it</Text>
            <Text style={styles.actionsBody}>
              Either person can mark the plan complete and add a short note. It will become a shared memory in Plans and the Circle Timeline.
            </Text>
            {showCompletion ? (
              <>
                <TextInput
                  value={memoryNote}
                  onChangeText={setMemoryNote}
                  placeholder="What do you want to remember? (optional)"
                  placeholderTextColor="#9b9b9b"
                  maxLength={1200}
                  multiline
                  textAlignVertical="top"
                  onFocus={keepCompletionVisible}
                  style={styles.memoryInput}
                />
                <Pressable
                  onPress={complete}
                  disabled={working}
                  style={({ pressed }) => [styles.primaryButton, (pressed || working) && styles.pressed]}
                >
                  {working ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="sparkles" size={17} color="#fff" />
                      <Text style={styles.primaryButtonText}>Save as Memory</Text>
                    </>
                  )}
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={revealCompletionEditor}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Mark Complete</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {plan.status === 'completed' ? (
          <View style={styles.memoryCard}>
            <Ionicons name="sparkles" size={23} color={COLORS.text} />
            <Text style={styles.memoryTitle}>Preserved in your Circle</Text>
            <Text style={styles.memoryBody}>
              This memory stays with the shared Circle and returns if the Circle is ever reopened after a locked period.
            </Text>
            <View style={styles.memoryLinkSummary}>
              <View style={styles.memoryLinkChip}>
                <Ionicons
                  name={plan.memoryAlbumId ? 'checkmark-circle' : 'images-outline'}
                  size={14}
                  color={COLORS.text}
                />
                <Text style={styles.memoryLinkChipText}>
                  {plan.memoryAlbumId ? 'Album linked' : 'No album linked'}
                </Text>
              </View>
              <View style={styles.memoryLinkChip}>
                <Ionicons
                  name={plan.memoryPostId ? 'checkmark-circle' : 'grid-outline'}
                  size={14}
                  color={COLORS.text}
                />
                <Text style={styles.memoryLinkChipText}>
                  {plan.memoryPostId ? 'Post linked' : 'No post linked'}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => navigation.navigate('TwoPersonPlanMemory', {
                planId,
                conversationId,
                circleName,
              })}
              style={({ pressed }) => [styles.buildMemoryButton, pressed && styles.pressed]}
            >
              <Ionicons name="albums-outline" size={17} color="#fff" />
              <Text style={styles.buildMemoryButtonText}>Build This Memory</Text>
            </Pressable>
          </View>
        ) : null}

        {canDelete ? (
          <Pressable
            onPress={remove}
            disabled={working}
            style={({ pressed }) => [styles.removeButton, (pressed || working) && styles.pressed]}
          >
            <Text style={styles.removeButtonText}>Remove Plan</Text>
          </Pressable>
        ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  keyboardView: { flex: 1 },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 180 },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  contextText: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
  title: { marginTop: 10, color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 27, lineHeight: 34 },
  statusCard: { marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: '#f5f3f8', flexDirection: 'row', alignItems: 'flex-start' },
  statusIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#ece8f1', alignItems: 'center', justifyContent: 'center' },
  statusCopy: { flex: 1, marginLeft: 11 },
  statusTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  statusBody: { marginTop: 3, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11.5, lineHeight: 17 },
  detailsCard: { marginTop: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, overflow: 'hidden' },
  detailRow: { minHeight: 66, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 13, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  detailIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#f1f1f1', alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, marginLeft: 11 },
  detailLabel: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
  detailValue: { marginTop: 3, color: COLORS.text, fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19 },
  actionsCard: { marginTop: 16, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, backgroundColor: '#fafafa' },
  actionsTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 15 },
  actionsBody: { marginTop: 4, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11.5, lineHeight: 17 },
  primaryButton: { minHeight: 44, marginTop: 11, borderRadius: 11, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  secondaryButton: { minHeight: 44, marginTop: 9, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, backgroundColor: '#f4f4f4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryButtonText: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  linkButton: { minHeight: 36, marginTop: 5, alignItems: 'center', justifyContent: 'center' },
  linkButtonText: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 12, textDecorationLine: 'underline' },
  memoryInput: { minHeight: 100, marginTop: 11, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, backgroundColor: '#fff', color: COLORS.text, fontFamily: 'Manrope_400Regular', fontSize: 13 },
  memoryCard: { marginTop: 16, padding: 17, borderRadius: 16, backgroundColor: '#f5f3f8', alignItems: 'center' },
  memoryTitle: { marginTop: 8, color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 15 },
  memoryBody: { marginTop: 5, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11.5, lineHeight: 17, textAlign: 'center' },
  memoryLinkSummary: { width: '100%', marginTop: 13, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 7 },
  memoryLinkChip: { minHeight: 29, paddingHorizontal: 9, borderRadius: 10, backgroundColor: '#ebe8ef', flexDirection: 'row', alignItems: 'center', gap: 5 },
  memoryLinkChipText: { color: COLORS.text, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
  buildMemoryButton: { width: '100%', minHeight: 44, marginTop: 13, borderRadius: 12, backgroundColor: COLORS.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  buildMemoryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  removeButton: { minHeight: 42, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  removeButtonText: { color: '#b42318', fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
  errorText: { marginTop: 13, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12, lineHeight: 17 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: COLORS.bg },
  stateText: { marginTop: 10, color: COLORS.subtext, fontFamily: 'Manrope_400Regular' },
  errorState: { marginTop: 12, color: COLORS.text, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.primary },
  retryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.7 },
});
