import type {
  BoardLayoutMode,
  Category,
  ProfileSettings,
  SpeechMode,
  Tile,
} from "../types/domain";
import type { ChildGender, SupportedLocale } from "../i18n/profileLanguage";

export const DEFAULT_PROFILE_ID = "default-profile";
export const DEFAULT_BOARD_ID = "default-board";
export const DEFAULT_BOARD_NAME = "Moje tabule";
export const DEFAULT_BOARD_LAYOUT_MODE: BoardLayoutMode = "manual";
export const DEFAULT_CATEGORY_ORDER: Category[] = ["needs", "feelings", "social", "food"];
export const DEFAULT_CATEGORIES_START_NEW_PAGE = true;

const DEFAULT_TILE_LOCALE: SupportedLocale = "cs-CZ";
const DEFAULT_TILE_CHILD_GENDER: ChildGender = "masculine";

type DefaultTileRow = {
  emoji: string;
  labelCs: string;
  category: Category;
};

const normalizeDefaultLocale = (locale: unknown): SupportedLocale =>
  locale === "en-US" ? "en-US" : "cs-CZ";

const normalizeDefaultChildGender = (childGender: unknown): ChildGender =>
  childGender === "feminine" ? "feminine" : "masculine";

export const DEFAULT_TILE_ROWS_CS_MASCULINE: DefaultTileRow[] = [
  // Page 1: home/core words for fast everyday communication.
  { emoji: "✅", labelCs: "Ano", category: "needs" },
  { emoji: "❌", labelCs: "Ne", category: "needs" },
  { emoji: "➕", labelCs: "Ještě", category: "needs" },
  { emoji: "🔚", labelCs: "Hotový", category: "needs" },
  { emoji: "🙋", labelCs: "Chci", category: "needs" },
  { emoji: "🙅", labelCs: "Nechci", category: "needs" },
  { emoji: "🆘", labelCs: "Pomoc", category: "needs" },
  { emoji: "✋", labelCs: "Stop", category: "needs" },
  { emoji: "😋", labelCs: "Jíst", category: "food" },
  { emoji: "🥤", labelCs: "Pít", category: "food" },
  { emoji: "🎮", labelCs: "Hrát", category: "social" },
  { emoji: "🚪", labelCs: "Ven", category: "needs" },
  { emoji: "👩", labelCs: "Máma", category: "social" },
  { emoji: "👨", labelCs: "Táta", category: "social" },
  { emoji: "🚽", labelCs: "Záchod", category: "needs" },
  { emoji: "😖", labelCs: "Bolí", category: "feelings" },

  // Page 2: child fringe words, routines, emotions, favorites.
  { emoji: "👋", labelCs: "Ahoj", category: "social" },
  { emoji: "⏳", labelCs: "Počkej", category: "needs" },
  { emoji: "🏠", labelCs: "Domů", category: "social" },
  { emoji: "😴", labelCs: "Spát", category: "feelings" },
  { emoji: "😊", labelCs: "Veselý", category: "feelings" },
  { emoji: "😢", labelCs: "Smutný", category: "feelings" },
  { emoji: "😡", labelCs: "Naštvaný", category: "feelings" },
  { emoji: "😕", labelCs: "Nevím", category: "feelings" },
  { emoji: "🍎", labelCs: "Jablko", category: "food" },
  { emoji: "🍌", labelCs: "Banán", category: "food" },
  { emoji: "🍪", labelCs: "Sušenka", category: "food" },
  { emoji: "🍫", labelCs: "Čokoláda", category: "food" },
  { emoji: "🐱", labelCs: "Kočka", category: "social" },
  { emoji: "📖", labelCs: "Knížka", category: "social" },
  { emoji: "⚽", labelCs: "Míč", category: "social" },
  { emoji: "🎵", labelCs: "Písnička", category: "social" },
];

export const DEFAULT_TILE_ROWS_CS_FEMININE: DefaultTileRow[] = [
  // Page 1: home/core words for fast everyday communication.
  { emoji: "✅", labelCs: "Ano", category: "needs" },
  { emoji: "❌", labelCs: "Ne", category: "needs" },
  { emoji: "➕", labelCs: "Ještě", category: "needs" },
  { emoji: "🔚", labelCs: "Hotová", category: "needs" },
  { emoji: "🙋", labelCs: "Chci", category: "needs" },
  { emoji: "🙅", labelCs: "Nechci", category: "needs" },
  { emoji: "🆘", labelCs: "Pomoc", category: "needs" },
  { emoji: "✋", labelCs: "Stop", category: "needs" },
  { emoji: "😋", labelCs: "Jíst", category: "food" },
  { emoji: "🥤", labelCs: "Pít", category: "food" },
  { emoji: "🎮", labelCs: "Hrát", category: "social" },
  { emoji: "🚪", labelCs: "Ven", category: "needs" },
  { emoji: "👩", labelCs: "Máma", category: "social" },
  { emoji: "👨", labelCs: "Táta", category: "social" },
  { emoji: "🚽", labelCs: "Záchod", category: "needs" },
  { emoji: "😖", labelCs: "Bolí", category: "feelings" },

  // Page 2: child fringe words, routines, emotions, favorites.
  { emoji: "👋", labelCs: "Ahoj", category: "social" },
  { emoji: "⏳", labelCs: "Počkej", category: "needs" },
  { emoji: "🏠", labelCs: "Domů", category: "social" },
  { emoji: "😴", labelCs: "Spát", category: "feelings" },
  { emoji: "😊", labelCs: "Veselá", category: "feelings" },
  { emoji: "😢", labelCs: "Smutná", category: "feelings" },
  { emoji: "😡", labelCs: "Naštvaná", category: "feelings" },
  { emoji: "😕", labelCs: "Nevím", category: "feelings" },
  { emoji: "🍎", labelCs: "Jablko", category: "food" },
  { emoji: "🍌", labelCs: "Banán", category: "food" },
  { emoji: "🍪", labelCs: "Sušenka", category: "food" },
  { emoji: "🍫", labelCs: "Čokoláda", category: "food" },
  { emoji: "🐱", labelCs: "Kočka", category: "social" },
  { emoji: "📖", labelCs: "Knížka", category: "social" },
  { emoji: "⚽", labelCs: "Míč", category: "social" },
  { emoji: "🎵", labelCs: "Písnička", category: "social" },
];

export const DEFAULT_TILE_ROWS_EN: DefaultTileRow[] = [
  // Page 1: home/core words for fast everyday communication.
  { emoji: "✅", labelCs: "Yes", category: "needs" },
  { emoji: "❌", labelCs: "No", category: "needs" },
  { emoji: "➕", labelCs: "More", category: "needs" },
  { emoji: "🔚", labelCs: "Done", category: "needs" },
  { emoji: "🙋", labelCs: "Want", category: "needs" },
  { emoji: "🙅", labelCs: "Not", category: "needs" },
  { emoji: "🆘", labelCs: "Help", category: "needs" },
  { emoji: "✋", labelCs: "Stop", category: "needs" },
  { emoji: "😋", labelCs: "Eat", category: "food" },
  { emoji: "🥤", labelCs: "Drink", category: "food" },
  { emoji: "🎮", labelCs: "Play", category: "social" },
  { emoji: "🚪", labelCs: "Outside", category: "needs" },
  { emoji: "👩", labelCs: "Mom", category: "social" },
  { emoji: "👨", labelCs: "Dad", category: "social" },
  { emoji: "🚽", labelCs: "Bathroom", category: "needs" },
  { emoji: "😖", labelCs: "Hurt", category: "feelings" },

  // Page 2: child fringe words, routines, emotions, favorites.
  { emoji: "👋", labelCs: "Hi", category: "social" },
  { emoji: "⏳", labelCs: "Wait", category: "needs" },
  { emoji: "🏠", labelCs: "Home", category: "social" },
  { emoji: "😴", labelCs: "Sleep", category: "feelings" },
  { emoji: "😊", labelCs: "Happy", category: "feelings" },
  { emoji: "😢", labelCs: "Sad", category: "feelings" },
  { emoji: "😡", labelCs: "Angry", category: "feelings" },
  { emoji: "😕", labelCs: "Unsure", category: "feelings" },
  { emoji: "🍎", labelCs: "Apple", category: "food" },
  { emoji: "🍌", labelCs: "Banana", category: "food" },
  { emoji: "🍪", labelCs: "Cookie", category: "food" },
  { emoji: "🍫", labelCs: "Chocolate", category: "food" },
  { emoji: "🐱", labelCs: "Cat", category: "social" },
  { emoji: "📖", labelCs: "Book", category: "social" },
  { emoji: "⚽", labelCs: "Ball", category: "social" },
  { emoji: "🎵", labelCs: "Song", category: "social" },
];

const DEFAULT_TILE_ROWS: Record<SupportedLocale, Record<ChildGender, DefaultTileRow[]>> = {
  "cs-CZ": {
    masculine: DEFAULT_TILE_ROWS_CS_MASCULINE,
    feminine: DEFAULT_TILE_ROWS_CS_FEMININE,
  },
  "en-US": {
    masculine: DEFAULT_TILE_ROWS_EN,
    feminine: DEFAULT_TILE_ROWS_EN,
  },
};

export const getDefaultTileRows = (
  locale: unknown = DEFAULT_TILE_LOCALE,
  childGender: unknown = DEFAULT_TILE_CHILD_GENDER,
): DefaultTileRow[] => {
  const normalizedLocale = normalizeDefaultLocale(locale ?? DEFAULT_TILE_LOCALE);
  const normalizedGender = normalizeDefaultChildGender(childGender ?? DEFAULT_TILE_CHILD_GENDER);
  return DEFAULT_TILE_ROWS[normalizedLocale][normalizedGender];
};

export const DEFAULT_SPEECH_MODE: SpeechMode = "tts";

export const DEFAULT_TILES = (
  updatedAt: string,
  options: { locale?: unknown; childGender?: unknown } = {},
): Tile[] =>
  getDefaultTileRows(options.locale, options.childGender).map((item, index) => ({
    id: `tile-${index + 1}`,
    boardId: DEFAULT_BOARD_ID,
    position: index,
    labelCs: item.labelCs,
    emoji: item.emoji,
    visualType: "emoji",
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
  backupPinEnabled: false,
  ttsRate: 0.86,
  ttsPitch: 1,
  preferredVoice: undefined,
  highContrast: false,
  showLabels: true,
  phraseBarEnabled: true,
  suggestionCount: 3,
  boardLayoutMode: DEFAULT_BOARD_LAYOUT_MODE,
  categoryOrder: [...DEFAULT_CATEGORY_ORDER],
  categoriesStartNewPage: DEFAULT_CATEGORIES_START_NEW_PAGE,
  childGender: DEFAULT_TILE_CHILD_GENDER,
  updatedAt,
  revision: 1,
});

export const CATEGORY_COLORS: Record<
  Category,
  { background: string; border: string }
> = {
  needs: { background: "#DCEAF8", border: "#6F92BE" },
  feelings: { background: "#F8E7BC", border: "#C39245" },
  social: { background: "#F2DDE7", border: "#B56E8D" },
  food: { background: "#DDEBD9", border: "#73976F" },
};

export const CATEGORY_LABELS: Record<Category, string> = {
  needs: "Potřeby",
  feelings: "Pocity",
  social: "Sociální",
  food: "Jídlo",
};

export const BOARD_LAYOUT_MODE_LABELS: Record<BoardLayoutMode, string> = {
  manual: "Vlastní pořadí",
  category: "Podle kategorií",
};

export const SPEECH_MODE_LABELS: Record<SpeechMode, string> = {
  tts: "Robot",
  recording_only: "Nahrávka",
};
