import type { Category } from '../types/domain';

export type AiProvider = 'openai';

export type EmojiSuggestion = {
  value: string;
  confidence: number;
  reason?: string;
};

export type EmojiSuggestionRequest = {
  label: string;
  locale: string;
  category?: Category;
  existingEmoji?: string;
};

export type EmojiSuggestionResponse = {
  suggestions: EmojiSuggestion[];
  provider: AiProvider;
  cached: boolean;
};

export type GenerateTileImageDraftRequest = {
  profileId?: string;
  tileId: string;
  label: string;
  locale: string;
  category?: Category;
};

export type GenerateTileImageDraftResponse = {
  draftId: string;
  storagePath: string;
  signedUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  provider: AiProvider;
  promptVersion: string;
  trialRemaining?: number | null;
};

export type PromoteTileImageDraftRequest = {
  profileId?: string;
  tileId: string;
  draftId: string;
  draftStoragePath: string;
  localUri?: string | null;
};

export type PromoteTileImageDraftResponse = {
  storagePath: string;
  signedUrl: string;
};
