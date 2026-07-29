import { supabase } from '../lib/supabase';
import { ensureAuthed } from './authService';

export const ACCOUNT_DELETION_CONFIRMATION = 'DELETE';

export async function deleteMyAccount(confirmation) {
  await ensureAuthed();

  const cleanConfirmation = String(confirmation || '').trim();
  if (cleanConfirmation !== ACCOUNT_DELETION_CONFIRMATION) {
    throw new Error('Type DELETE exactly to confirm account deletion.');
  }

  const { data, error } = await supabase.functions.invoke('account-deletion', {
    body: { confirmation: cleanConfirmation },
  });

  if (error) {
    throw new Error(
      data?.error
      || error?.message
      || 'Circles could not delete this account.'
    );
  }

  if (data?.error) throw new Error(data.error);
  if (!data?.success) {
    throw new Error('Circles could not confirm that the account was deleted.');
  }

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // The server already removed the Auth identity, so a missing local session
    // is not a deletion failure.
  }

  return {
    success: true,
    receiptId: data?.receipt_id || null,
  };
}
