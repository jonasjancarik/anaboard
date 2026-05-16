export type SupportedLocale = "cs-CZ" | "en-US";

export type ChildGender = "masculine" | "feminine";

type SupportedLanguage = {
  locale: SupportedLocale;
  label: string;
  labelEn: string;
  isGendered: boolean;
  defaultBoardName: string;
};

export const DEFAULT_PROFILE_LOCALE: SupportedLocale = "cs-CZ";
export const DEFAULT_CHILD_GENDER: ChildGender = "masculine";

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  {
    locale: "cs-CZ",
    label: "Čeština",
    labelEn: "Czech",
    isGendered: true,
    defaultBoardName: "Moje tabule",
  },
  {
    locale: "en-US",
    label: "English",
    labelEn: "English",
    isGendered: false,
    defaultBoardName: "My board",
  },
];

export const CHILD_GENDER_OPTIONS: Array<{
  value: ChildGender;
  label: string;
  detail: string;
}> = [
  {
    value: "masculine",
    label: "Mužský rod",
    detail: "Například „veselý“ nebo „hotový“.",
  },
  {
    value: "feminine",
    label: "Ženský rod",
    detail: "Například „veselá“ nebo „hotová“.",
  },
];

export const SUPPORTED_CHILD_GENDERS: ChildGender[] = CHILD_GENDER_OPTIONS.map(
  (option) => option.value,
);

const SUPPORTED_LOCALE_SET = new Set<string>(
  SUPPORTED_LANGUAGES.map((language) => language.locale),
);

const CHILD_GENDER_SET = new Set<string>(
  SUPPORTED_CHILD_GENDERS,
);

export const normalizeSupportedLocale = (value: unknown): SupportedLocale => {
  return typeof value === "string" && SUPPORTED_LOCALE_SET.has(value)
    ? (value as SupportedLocale)
    : DEFAULT_PROFILE_LOCALE;
};

export const normalizeChildGender = (value: unknown): ChildGender => {
  return typeof value === "string" && CHILD_GENDER_SET.has(value)
    ? (value as ChildGender)
    : DEFAULT_CHILD_GENDER;
};

export const getSupportedLanguage = (
  value: unknown,
): SupportedLanguage => {
  const locale = normalizeSupportedLocale(value);
  return (
    SUPPORTED_LANGUAGES.find((language) => language.locale === locale) ??
    SUPPORTED_LANGUAGES[0]
  );
};

export const isGenderedLocale = (value: unknown): boolean => {
  return getSupportedLanguage(value).isGendered;
};
