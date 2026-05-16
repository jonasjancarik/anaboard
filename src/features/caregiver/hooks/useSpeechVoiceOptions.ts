import { useEffect, useState } from 'react';
import * as Speech from 'expo-speech';

import type { SettingChoiceOption } from '../components/SettingChoiceStepper';

export const DEFAULT_VOICE_VALUE = '__default_voice__';
const CZECH_LANGUAGE_PREFIX = 'cs';

type DeviceVoice = Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>[number];

const buildVoiceOptions = (voices: DeviceVoice[]): SettingChoiceOption[] => {
  const sortedVoices = voices
    .filter((voice) => voice.language.toLowerCase().startsWith(CZECH_LANGUAGE_PREFIX))
    .sort((left, right) => {
    if (left.language !== right.language) {
      return left.language.localeCompare(right.language);
    }

    if (left.quality !== right.quality) {
      return left.quality === 'Enhanced' ? -1 : 1;
    }

    return left.name.localeCompare(right.name, 'cs');
  });

  return [
    {
      value: DEFAULT_VOICE_VALUE,
      label: 'Výchozí hlas',
      detail: 'Nech zařízení vybrat nejlepší český hlas.',
    },
    ...sortedVoices.map((voice) => ({
      value: voice.identifier,
      label: voice.name,
      detail: `Čeština · ${voice.language}${
        voice.quality === 'Enhanced' ? ' · lepší kvalita' : ''
      }`,
    })),
  ];
};

export const useSpeechVoiceOptions = () => {
  const [voiceOptions, setVoiceOptions] = useState<SettingChoiceOption[]>(() => buildVoiceOptions([]));
  const [isVoiceOptionsLoading, setIsVoiceOptionsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const loadVoiceOptions = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        if (!isCancelled) {
          setVoiceOptions(buildVoiceOptions(voices));
        }
      } catch {
        if (!isCancelled) {
          setVoiceOptions(buildVoiceOptions([]));
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
  }, []);

  return {
    voiceOptions,
    isVoiceOptionsLoading,
  };
};
