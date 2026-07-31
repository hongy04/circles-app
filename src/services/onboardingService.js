import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';
import { uploadToBucket } from './uploadService';
import {
  fetchMyEditableProfile,
  isProfileIdentityComplete,
  normalizeUsername,
  validateProfileInput,
} from './profileService';
import { redeemAppInvite } from './inviteService';
import {
  claimEventGuestAttendance,
} from './eventGuestInviteService';
import {
  replaceWithClaimedEvent,
  replaceWithGuestClaimProfileSetup,
  replaceWithMainTabs,
} from '../navigation/navigationActions';

const REMOTE_URI_PATTERN = /^https?:\/\//i;

export async function getMyOnboardingState() {
  await ensureAuthed();

  const { data, error } = await supabase
    .rpc('get_my_onboarding_state')
    .single();

  if (error) throw error;

  return {
    profileCompleted: Boolean(data?.profile_completed),
    contactsCompleted: Boolean(data?.contacts_completed),
    displayName: data?.display_name || '',
    username: data?.username || '',
    avatarUrl: data?.avatar_url || null,
  };
}

export async function checkUsernameAvailability(value) {
  await ensureAuthed();
  const username = normalizeUsername(value);

  if (
    username.length < 3
    || username.length > 24
    || !/^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$/.test(username)
  ) {
    return false;
  }

  const { data, error } = await supabase.rpc('is_username_available', {
    p_username: username,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function completeProfileOnboarding({
  displayName,
  username,
  bio,
  avatarUri,
  avatarMimeType = 'image/jpeg',
  onPhaseChange,
}) {
  const clean = validateProfileInput({ displayName, username, bio });

  if (!clean.username) {
    throw new Error('Choose a username to continue.');
  }

  const session = await ensureAuthed();
  let avatarUrl = avatarUri || null;

  if (avatarUri && !REMOTE_URI_PATTERN.test(avatarUri)) {
    onPhaseChange?.('Uploading your photo…');
    avatarUrl = await uploadToBucket(
      avatarUri,
      'avatars',
      avatarMimeType,
      { folder: session.user.id }
    );
  }

  onPhaseChange?.('Creating your profile…');

  const { data, error } = await supabase
    .rpc('complete_my_profile_onboarding', {
      p_display_name: clean.displayName,
      p_username: clean.username,
      p_bio: clean.bio || null,
      p_avatar_url: avatarUrl,
    })
    .single();

  if (error) {
    if (error.code === '23505' || /username.*taken/i.test(error.message || '')) {
      throw new Error('That username was just taken. Try another one.');
    }
    throw error;
  }

  return data;
}

export async function completeContactsOnboarding(choice = 'skipped') {
  await ensureAuthed();

  const normalizedChoice = ['synced', 'skipped', 'unavailable'].includes(choice)
    ? choice
    : 'skipped';

  const { data, error } = await supabase.rpc(
    'complete_my_contacts_onboarding',
    { p_choice: normalizedChoice }
  );

  if (error) throw error;
  return data || { completed: true, choice: normalizedChoice };
}

/**
 * Runs the invitation/guest handoff after a profile exists, then either opens
 * contact onboarding or enters the app. This is shared by OTP verification,
 * profile setup, and the development account picker.
 */
export async function continueAfterProfile({
  navigation,
  inviteToken = null,
  eventGuestToken = null,
}) {
  let inviteResult = null;
  let inviteError = '';

  if (inviteToken) {
    try {
      inviteResult = await redeemAppInvite(inviteToken);
    } catch (error) {
      inviteError = error?.message || 'The invitation could not be applied.';
    }
  }

  if (eventGuestToken) {
    const profile = await fetchMyEditableProfile();

    if (!isProfileIdentityComplete(profile)) {
      replaceWithGuestClaimProfileSetup(navigation, eventGuestToken);
      return;
    }

    const eventClaimResult = await claimEventGuestAttendance(eventGuestToken);
    replaceWithClaimedEvent(navigation, eventClaimResult);
    return;
  }

  const state = await getMyOnboardingState();

  if (!state.contactsCompleted) {
    navigation.replace('ContactsIntro', {
      inviteResult,
      inviteError,
      eventClaimResult: null,
      eventClaimError: '',
    });
    return;
  }

  replaceWithMainTabs(navigation);
}
