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

export type AutocompleteCandidate = {
  tileId: string;
  label: string;
  category?: Category;
};

export type AutocompleteRerankRequest = {
  locale: string;
  sentenceTileIds: string[];
  sentenceLabels: string[];
  candidates: AutocompleteCandidate[];
  limit?: number;
};

export type AutocompleteSuggestion = {
  tileId: string;
  confidence: number;
  reason?: string;
};

export type AutocompleteRerankResponse = {
  suggestions: AutocompleteSuggestion[];
  provider: AiProvider;
};

export type GenerateTileImageDraftRequest = {
  profileId: string;
  tileId: string;
  label: string;
  locale: string;
  category?: Category;
  stylePreset: 'warm-flat-pictogram-v1';
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
};

export type PromoteTileImageDraftRequest = {
  profileId: string;
  tileId: string;
  draftId: string;
  draftStoragePath: string;
};

export type PromoteTileImageDraftResponse = {
  storagePath: string;
  signedUrl: string;
};
