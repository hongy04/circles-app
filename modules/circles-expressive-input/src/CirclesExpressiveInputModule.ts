import { requireOptionalNativeModule } from 'expo-modules-core';

export type AppleGlyphImportResult = {
  uri: string;
  mimeType: 'image/png';
  contentIdentifier?: string;
  contentDescription?: string;
  width?: number;
  height?: number;
  byteSize?: number;
  source: 'apple_glyph';
};

type CirclesExpressiveInputNativeModule = {
  bridgeVersion(): string;
  isAdaptiveImageGlyphSupported(): boolean;
  pickAppleGlyphAsync(): Promise<AppleGlyphImportResult | null>;
  discardTemporaryAppleGlyphAsync(uri: string): Promise<boolean>;
};

export default requireOptionalNativeModule<CirclesExpressiveInputNativeModule>(
  'CirclesExpressiveInput'
);
