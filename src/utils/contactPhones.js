import * as Localization from 'expo-localization';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function getRegionCode() {
  const locale = Localization.getLocales?.()?.[0];
  return locale?.regionCode || Localization?.region || 'US';
}

export function normalizeToE164(raw, region = getRegionCode()) {
  try {
    const parsed = parsePhoneNumberFromString(raw, region);
    if (parsed?.isValid()) return parsed.number;
  } catch {
    // Fall through to a conservative digit-only normalization.
  }

  const digits = String(raw || '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}
