import type {
  Category,
  ProfileSettings,
  SpeechMode,
  Tile,
} from "../types/domain";

export const DEFAULT_PROFILE_ID = "default-profile";
export const DEFAULT_BOARD_ID = "default-board";

const DEFAULT_TILE_ROWS: Array<{
  emoji: string;
  labelCs: string;
  category: Category;
}> = [
  { emoji: "✅", labelCs: "Ano", category: "needs" },
  { emoji: "❌", labelCs: "Ne", category: "needs" },
  { emoji: "🆘", labelCs: "Pomoc", category: "needs" },
  { emoji: "🚽", labelCs: "Záchod", category: "needs" },
  { emoji: "😊", labelCs: "Veselý", category: "feelings" },
  { emoji: "😢", labelCs: "Smutný", category: "feelings" },
  { emoji: "😴", labelCs: "Spát", category: "feelings" },
  { emoji: "🤒", labelCs: "Nemocný", category: "feelings" },
  { emoji: "👩", labelCs: "Máma", category: "social" },
  { emoji: "👨", labelCs: "Táta", category: "social" },
  { emoji: "🐱", labelCs: "Kočka", category: "social" },
  { emoji: "🏠", labelCs: "Domů", category: "social" },
  { emoji: "😋", labelCs: "Jíst", category: "food" },
  { emoji: "🥤", labelCs: "Pít", category: "food" },
  { emoji: "➕", labelCs: "Více", category: "food" },
  { emoji: "🔚", labelCs: "Hotovo", category: "food" },
];

export const DEFAULT_SPEECH_MODE: SpeechMode = "tts";

export const DEFAULT_TILES = (updatedAt: string): Tile[] =>
  DEFAULT_TILE_ROWS.map((item, index) => ({
    id: `tile-${index + 1}`,
    boardId: DEFAULT_BOARD_ID,
    position: index,
    labelCs: item.labelCs,
    emoji: item.emoji,
    category: item.category,
    speechMode: DEFAULT_SPEECH_MODE,
    updatedAt,
    revision: 1,
  }));

export const DEFAULT_PROFILE_SETTINGS = (
  pinHash: string,
  updatedAt: string,
): ProfileSettings => ({
  profileId: DEFAULT_PROFILE_ID,
  pinHash,
  lockEnabled: true,
  ttsRate: 0.86,
  ttsPitch: 1,
  preferredVoice: undefined,
  highContrast: false,
  showLabels: false,
  updatedAt,
  revision: 1,
});

export const CATEGORY_COLORS: Record<
  Category,
  { background: string; border: string }
> = {
  needs: { background: "#D6EFFF", border: "#1D8FE1" },
  feelings: { background: "#FFECA8", border: "#D49300" },
  social: { background: "#FFD7EE", border: "#CB2B7A" },
  food: { background: "#D8F7D9", border: "#2DAA48" },
};

export const SPEECH_MODE_LABELS: Record<SpeechMode, string> = {
  tts: "TTS",
  recording_with_tts_fallback: "Nahrávka + TTS",
  recording_only: "Jen nahrávka",
};
