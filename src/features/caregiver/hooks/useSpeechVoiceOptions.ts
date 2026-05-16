import { useEffect, useState } from 'react';
import * as Speech from 'expo-speech';

import type { SettingChoiceOption } from '../components/SettingChoiceStepper';
import {
  DEFAULT_PROFILE_LOCALE,
  normalizeSupportedLocale,
} from '../../../shared/i18n/profileLanguage';

export const DEFAULT_VOICE_VALUE = '__default_voice__';

type DeviceVoice = Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>[number];

const buildVoiceOptions = (voices: DeviceVoice[], locale: unknown): SettingChoiceOption[] => {
  const normalizedLocale = normalizeSupportedLocale(locale ?? DEFAULT_PROFILE_LOCALE);
  const languagePrefix = normalizedLocale.split('-')[0].toLowerCase();
  const languageLabel = normalizedLocale === 'en-US' ? 'English' : 'Čeština';
  const sortedVoices = voices
    .filter((voice) => voice.language.toLowerCase().startsWith(languagePrefix))
    .sort((left, right) => {
    if (left.language !== right.language) {
      return left.language.localeCompare(right.language);
    }

    if (left.quality !== right.quality) {
      return left.quality === 'Enhanced' ? -1 : 1;
    }

    return left.name.localeCompare(right.name, normalizedLocale);
  });

  return [
    {
      value: DEFAULT_VOICE_VALUE,
      label: normalizedLocale === 'en-US' ? 'Default voice' : 'Výchozí hlas',
      detail:
        normalizedLocale === 'en-US'
          ? 'Let the device choose the best English voice.'
          : 'Nech zařízení vybrat nejlepší český hlas.',
    },
    ...sortedVoices.map((voice) => ({
      value: voice.identifier,
      label: voice.name,
      detail: `${languageLabel} · ${voice.language}${
        voice.quality === 'Enhanced'
          ? normalizedLocale === 'en-US'
            ? ' · better quality'
            : ' · lepší kvalita'
          : ''
      }`,
    })),
  ];
};

export const useSpeechVoiceOptions = (locale: unknown = DEFAULT_PROFILE_LOCALE) => {
  const normalizedLocale = normalizeSupportedLocale(locale ?? DEFAULT_PROFILE_LOCALE);
  const [voiceOptions, setVoiceOptions] = useState<SettingChoiceOption[]>(() =>
    buildVoiceOptions([], normalizedLocale)
  );
  const [isVoiceOptionsLoading, setIsVoiceOptionsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const loadVoiceOptions = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        if (!isCancelled) {
          setVoiceOptions(buildVoiceOptions(voices, normalizedLocale));
        }
      } catch {
        if (!isCancelled) {
          setVoiceOptions(buildVoiceOptions([], normalizedLocale));
        }
      } finally {
        if (!isCancelled) {
          setIsVoiceOptionsLoading(false);
        }
      }
    };

    void loadVoiceOptions();

    return () => {
      isCancelled = true;
    };
  }, [normalizedLocale]);

  return {
    voiceOptions,
    isVoiceOptionsLoading,
  };
};
