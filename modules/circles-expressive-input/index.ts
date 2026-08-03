import CirclesExpressiveInputModule, {
  type AppleGlyphImportResult,
} from './src/CirclesExpressiveInputModule';

export type { AppleGlyphImportResult };

/**
 * Returns false in Expo Go and on platforms where the app-local native module
 * is not present. Production/development iOS builds include the module.
 */
export function hasCirclesExpressiveInputBridge(): boolean {
  return CirclesExpressiveInputModule != null;
}

export function getCirclesExpressiveInputBridgeVersion(): string | null {
  return CirclesExpressiveInputModule?.bridgeVersion() ?? null;
}

/**
 * NSAdaptiveImageGlyph is available starting in iOS 18. This is intentionally
 * native-reported instead of inferred from JS platform strings.
 */
export function canImportAppleGlyphs(): boolean {
  return CirclesExpressiveInputModule?.isAdaptiveImageGlyphSupported() ?? false;
}

/**
 * Opens a native UITextView-backed input surface that accepts Apple's
 * personalized expressive images (Stickers, Memoji, Genmoji). The native
 * bridge exports the chosen glyph as a temporary transparent PNG so Circles'
 * existing private decoration asset pipeline can upload/render it everywhere.
 */
export async function pickAppleGlyphAsync(): Promise<AppleGlyphImportResult | null> {
  if (!CirclesExpressiveInputModule) {
    throw new Error('Apple Stickers are available in an iOS development or production build.');
  }
  return CirclesExpressiveInputModule.pickAppleGlyphAsync();
}

/**
 * Best-effort cleanup for a temporary PNG returned by the native picker when
 * JS decides not to keep it (for example, a duplicate import). The native
 * side only removes files from its own cache directory.
 */
export async function discardTemporaryAppleGlyphAsync(uri: string | null | undefined): Promise<boolean> {
  const clean = String(uri || '').trim();
  if (!CirclesExpressiveInputModule || !clean) return false;
  return CirclesExpressiveInputModule.discardTemporaryAppleGlyphAsync(clean);
}
