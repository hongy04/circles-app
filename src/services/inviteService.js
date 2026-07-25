import { Platform, Share } from 'react-native';
import * as Linking from 'expo-linking';
import * as SMS from 'expo-sms';

import { INVITE_BASE_URL } from '../config/env';
import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';

function cleanBaseUrl(value = '') {
  return value.trim().replace(/\/+$/, '');
}

export function getInviteLinkingPrefixes() {
  const prefixes = [Linking.createURL('/'), 'circles://'];
  const configuredBase = cleanBaseUrl(INVITE_BASE_URL);

  if (configuredBase) {
    try {
      const parsed = new URL(configuredBase);
      prefixes.push(`${parsed.protocol}//${parsed.host}`);
    } catch {
      // Invalid optional production configuration should not break development.
    }
  }

  return Array.from(new Set(prefixes.filter(Boolean)));
}

export function buildInviteUrl(token) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) throw new Error('Invitation token is missing.');

  const configuredBase = cleanBaseUrl(INVITE_BASE_URL);
  if (configuredBase) {
    return `${configuredBase}/${encodeURIComponent(cleanToken)}`;
  }

  return Linking.createURL(`invite/${encodeURIComponent(cleanToken)}`);
}

function buildInviteMessage(invite, url) {
  if (invite.kind === 'circle') {
    return `${invite.inviterName} invited you to join ${invite.circleName} on Circles—a private space for people who actually know each other.\n\n${url}`;
  }

  return `${invite.inviterName} invited you to connect on Circles—a private space for the people you actually know.\n\n${url}`;
}

function mapInvite(data) {
  if (!data?.token) throw new Error('Circles could not create an invitation.');

  const invite = {
    token: data.token,
    kind: data.kind,
    expiresAt: data.expires_at || null,
    inviterName: data.inviter_name || 'A friend',
    inviterAvatar: data.inviter_avatar || null,
    conversationId: data.conversation_id || null,
    circleName: data.circle_name || 'Circle',
    memberCount: Number(data.member_count || 0),
  };

  invite.url = buildInviteUrl(invite.token);
  invite.message = buildInviteMessage(invite, invite.url);
  return invite;
}

export async function createPersonalInvite() {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('create_app_invite', {
    p_kind: 'personal',
    p_conversation_id: null,
  });

  if (error) throw error;
  return mapInvite(data);
}

export async function createCircleInvite(conversationId) {
  await ensureAuthed();
  if (!conversationId) throw new Error('Circle is missing.');

  const { data, error } = await supabase.rpc('create_app_invite', {
    p_kind: 'circle',
    p_conversation_id: conversationId,
  });

  if (error) throw error;
  return mapInvite(data);
}

export async function previewAppInvite(token) {
  const { data, error } = await supabase.rpc('preview_app_invite', {
    p_token: token,
  });

  if (error) throw error;

  return {
    valid: Boolean(data?.valid),
    reason: data?.reason || null,
    kind: data?.kind || null,
    expiresAt: data?.expires_at || null,
    inviterName: data?.inviter_name || 'A friend',
    inviterAvatar: data?.inviter_avatar || null,
    conversationId: data?.conversation_id || null,
    circleName: data?.circle_name || 'Circle',
    memberCount: Number(data?.member_count || 0),
  };
}

export async function redeemAppInvite(token) {
  await ensureAuthed();
  const { data, error } = await supabase.rpc('redeem_app_invite', {
    p_token: token,
  });

  if (error) throw error;

  return {
    kind: data?.kind || 'personal',
    outcome: data?.outcome || 'request_exists',
    inviterName: data?.inviter_name || 'A friend',
    conversationId: data?.conversation_id || null,
    circleName: data?.circle_name || 'Circle',
  };
}

export async function shareInvite(invite) {
  if (!invite?.message) throw new Error('Invitation is not ready.');

  return Share.share(
    {
      title: invite.kind === 'circle'
        ? `Join ${invite.circleName} on Circles`
        : 'Join me on Circles',
      message: invite.message,
      ...(Platform.OS === 'ios' ? { url: invite.url } : {}),
    },
    {
      subject: invite.kind === 'circle'
        ? `Join ${invite.circleName} on Circles`
        : 'Join me on Circles',
    }
  );
}

export async function textInviteToContact(phoneNumber, invite) {
  if (!phoneNumber) throw new Error('This contact has no usable phone number.');
  if (!invite?.message) throw new Error('Invitation is not ready.');

  const available = await SMS.isAvailableAsync();
  if (!available) {
    await shareInvite(invite);
    return { result: 'share-sheet' };
  }

  return SMS.sendSMSAsync(phoneNumber, invite.message);
}
