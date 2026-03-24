const toBooleanFlag = (value: string | undefined, fallback = false): boolean => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

export const AI_FEATURE_FLAGS = {
  emojiSuggestions: toBooleanFlag(process.env.EXPO_PUBLIC_AI_EMOJI_SUGGESTIONS, __DEV__),
  autocompleteRerank: toBooleanFlag(process.env.EXPO_PUBLIC_AI_AUTOCOMPLETE_RERANK, false),
  generatedTileImages: toBooleanFlag(process.env.EXPO_PUBLIC_AI_GENERATED_TILE_IMAGES, false),
} as const;
