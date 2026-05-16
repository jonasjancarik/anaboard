import { CS_APP_COPY } from "./appCopy.czech";
import { EN_APP_COPY } from "./appCopy.english";
import type {
  ChildGenderOptionCopy,
  ChoiceOptionCopy,
  LocaleCopy,
} from "./appCopy.types";
import {
  DEFAULT_PROFILE_LOCALE,
  SUPPORTED_LANGUAGES,
  normalizeSupportedLocale,
  type SupportedLocale,
} from "./profileLanguage";

export const APP_COPY: Record<SupportedLocale, LocaleCopy> = {
  "cs-CZ": CS_APP_COPY,
  "en-US": EN_APP_COPY,
};

export const getAppCopy = (locale: unknown = DEFAULT_PROFILE_LOCALE): LocaleCopy => {
  return APP_COPY[normalizeSupportedLocale(locale)];
};

export const getLanguageOptions = (
  displayLocale: unknown,
): ChoiceOptionCopy[] => {
  const copy = getAppCopy(displayLocale);
  const normalizedDisplayLocale = normalizeSupportedLocale(displayLocale);

  return SUPPORTED_LANGUAGES.map((language) => ({
    value: language.locale,
    label: normalizedDisplayLocale === "en-US" ? language.labelEn : language.label,
    detail: language.isGendered
      ? copy.languageOptions.genderedDetail
      : copy.languageOptions.nongenderedDetail,
  }));
};

export const getChildGenderOptions = (
  displayLocale: unknown,
): ChildGenderOptionCopy[] => {
  return getAppCopy(displayLocale).childGenderOptions;
};
