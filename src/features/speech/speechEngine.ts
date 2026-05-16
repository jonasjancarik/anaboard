import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { mediaAssetExists, resolveManagedMediaUri } from '../../shared/media/mediaStorage';
import { logError, logEvent } from '../../shared/telemetry/logger';
import type { AudioClip, ProfileSettings, SentenceToken, SpeechSegment, Tile } from '../../shared/types/domain';
import { sleep } from '../../shared/utils/time';

const INTER_SEGMENT_PAUSE_MS = 120;
const TTS_LANGUAGE = 'cs-CZ';
const TTS_TIMEOUT_BUFFER_MS = 2_000;
const TTS_TIMEOUT_MIN_MS = 4_000;
const TTS_TIMEOUT_MAX_MS = 20_000;

type SpeechSettings = Pick<ProfileSettings, 'ttsRate' | 'ttsPitch' | 'preferredVoice'>;
type TtsVoiceSelection = {
  language: string;
  voice?: string;
};

type SegmentBuildInput = {
  tokens: SentenceToken[];
  tilesById: Record<string, Tile>;
  clipsById: Record<string, AudioClip>;
};

const estimateTextDuration = (text: string): number => Math.max(500, text.length * 90);

let voiceCache: Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>> | null = null;
let voiceCachePromise: Promise<Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>> | null = null;

const getAvailableVoices = async (): Promise<Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>> => {
  if (voiceCache) {
    return voiceCache;
  }

  if (!voiceCachePromise) {
    voiceCachePromise = Speech.getAvailableVoicesAsync()
      .then((voices) => {
        voiceCache = voices;
        return voices;
      })
      .catch((error) => {
        voiceCachePromise = null;
        throw error;
      });
  }

  return await voiceCachePromise;
};

const findLanguageVoice = (
  voices: Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>,
  language: string
): string | undefined => {
  const exactMatch = voices.find((voice) => voice.language === language);
  if (exactMatch) {
    return exactMatch.identifier;
  }

  const baseLanguage = language.split('-')[0];
  return voices.find((voice) => voice.language.startsWith(`${baseLanguage}-`))?.identifier;
};

const getPlayableClipUri = async (clip?: AudioClip): Promise<string | null> => {
  if (!clip?.localUri) {
    return null;
  }

  const clipExists = await mediaAssetExists(clip.localUri);
  if (!clipExists) {
    return null;
  }

  return await resolveManagedMediaUri(clip.localUri);
};

const clipSegment = (
  token: SentenceToken,
  tile: Tile,
  clip: AudioClip,
  clipUri: string
): SpeechSegment => ({
  tokenId: token.tokenId,
  kind: 'clip',
  clipUri,
  mode: tile.speechMode,
  estimatedMs: clip.durationMs,
  tileId: tile.id,
  fallback: false,
});

const ttsSegment = (token: SentenceToken, tile: Tile, fallback: boolean): SpeechSegment => ({
  tokenId: token.tokenId,
  kind: 'tts',
  text: token.label,
  mode: tile.speechMode,
  estimatedMs: estimateTextDuration(token.label),
  tileId: tile.id,
  fallback,
});

export const buildSpeechSegments = async ({
  tokens,
  tilesById,
  clipsById,
}: SegmentBuildInput): Promise<SpeechSegment[]> => {
  const segments: SpeechSegment[] = [];

  for (const token of tokens) {
    const tile = tilesById[token.tileId];
    if (!tile) {
      continue;
    }

    const clip = tile.audioClipId ? clipsById[tile.audioClipId] : undefined;
    const clipUri = await getPlayableClipUri(clip);

    if (tile.speechMode === 'tts') {
      segments.push(ttsSegment(token, tile, false));
      continue;
    }

    if (clip && clipUri) {
      segments.push(clipSegment(token, tile, clip, clipUri));
      continue;
    }

    logEvent('speech_clip_missing', {
      tile_id: tile.id,
      mode: tile.speechMode,
    });

  }

  return segments;
};

class SpeechEngine {
  private jobId = 0;

  private currentPlayer: AudioPlayer | null = null;

  private settings: SpeechSettings = {
    ttsRate: 0.86,
    ttsPitch: 1,
    preferredVoice: undefined,
  };

  public setSettings(settings: SpeechSettings): void {
    this.settings = settings;
  }

  public cancel = async (): Promise<void> => {
    this.jobId += 1;
    Speech.stop();

    if (this.currentPlayer) {
      try {
        this.currentPlayer.pause();
      } catch {
        // best effort
      }
      try {
        this.currentPlayer.remove();
      } catch {
        // best effort
      }
      this.currentPlayer = null;
    }
  };

  public playSegments = async (segments: SpeechSegment[]): Promise<void> => {
    await this.cancel();
    this.jobId += 1;
    const activeJob = this.jobId;

    for (const segment of segments) {
      if (activeJob !== this.jobId) {
        return;
      }

      logEvent('speech_play_start', {
        tile_id: segment.tileId,
        mode: segment.mode,
        kind: segment.kind,
        fallback: segment.fallback,
      });

      try {
        if (segment.kind === 'clip' && segment.clipUri) {
          await this.playClip(segment.clipUri, activeJob);
          logEvent('speech_mode_used', {
            tile_id: segment.tileId,
            mode: segment.mode,
            kind: 'clip',
            fallback: segment.fallback,
          });
        } else if (segment.text) {
          await this.playTts(segment.text, activeJob);
          logEvent('speech_mode_used', {
            tile_id: segment.tileId,
            mode: segment.mode,
            kind: 'tts',
            fallback: segment.fallback,
          });
        }

        logEvent('speech_play_success', {
          tile_id: segment.tileId,
          mode: segment.mode,
          kind: segment.kind,
        });
      } catch (error) {
        logError('speech_play_error', error, {
          tile_id: segment.tileId,
          mode: segment.mode,
          kind: segment.kind,
        });
      }

      if (activeJob !== this.jobId) {
        return;
      }
      await sleep(INTER_SEGMENT_PAUSE_MS);
    }
  };

  public previewTts = async (
    text: string,
    settings: SpeechSettings
  ): Promise<void> => {
    await this.cancel();
    this.jobId += 1;
    const activeJob = this.jobId;
    await this.playTts(text, activeJob, settings);
  };

  private configureTtsAudioMode = async (): Promise<void> => {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });
  };

  private resolveTtsVoice = async (settings: SpeechSettings): Promise<TtsVoiceSelection> => {
    if (!settings.preferredVoice) {
      return {
        language: TTS_LANGUAGE,
      };
    }

    try {
      const voices = await getAvailableVoices();
      const preferredVoice = voices.find((voice) => voice.identifier === settings.preferredVoice);
      if (preferredVoice) {
        return {
          language: preferredVoice.language || TTS_LANGUAGE,
          voice: preferredVoice.identifier,
        };
      }

      const fallbackVoice = findLanguageVoice(voices, TTS_LANGUAGE);
      logEvent('speech_voice_unavailable', {
        preferred_voice: settings.preferredVoice,
        platform: Platform.OS,
        fallback_voice: fallbackVoice ?? null,
      });

      return {
        language: TTS_LANGUAGE,
        voice: fallbackVoice,
      };
    } catch (error) {
      logError('speech_voice_lookup_error', error, {
        platform: Platform.OS,
      });

      return {
        language: TTS_LANGUAGE,
      };
    }
  };

  private playTts = async (
    text: string,
    activeJob: number,
    settingsOverride?: SpeechSettings
  ): Promise<void> => {
    if (!text.trim()) {
      return;
    }

    const settings = settingsOverride ?? this.settings;
    const timeoutMs = Math.min(
      TTS_TIMEOUT_MAX_MS,
      Math.max(TTS_TIMEOUT_MIN_MS, estimateTextDuration(text) + TTS_TIMEOUT_BUFFER_MS)
    );

    await this.configureTtsAudioMode();
    const voiceSelection = await this.resolveTtsVoice(settings);

    await new Promise<void>((resolve, reject) => {
      let didSettle = false;

      const finishResolve = () => {
        if (didSettle) {
          return;
        }
        didSettle = true;
        clearTimeout(timeoutHandle);
        resolve();
      };

      const finishReject = (error: unknown) => {
        if (didSettle) {
          return;
        }
        didSettle = true;
        clearTimeout(timeoutHandle);
        reject(error instanceof Error ? error : new Error('TTS playback failed'));
      };

      const timeoutHandle = setTimeout(() => {
        void Speech.stop().catch(() => {
          // Best effort stop for stuck TTS jobs.
        });
        finishReject(new Error('TTS playback timeout'));
      }, timeoutMs);

      try {
        Speech.speak(text, {
          language: voiceSelection.language,
          rate: settings.ttsRate,
          pitch: settings.ttsPitch,
          voice: voiceSelection.voice,
          useApplicationAudioSession: Platform.OS === 'ios',
          onDone: () => {
            if (activeJob === this.jobId) {
              finishResolve();
            }
          },
          onStopped: () => {
            finishResolve();
          },
          onError: (error) => {
            finishReject(error);
          },
        });
      } catch (error) {
        finishReject(error);
      }
    }).catch((error) => {
      logError('speech_tts_error', error, {
        platform: Platform.OS,
        preferred_voice: settings.preferredVoice ?? null,
      });
      throw error;
    });
  };

  private playClip = async (uri: string, activeJob: number): Promise<void> => {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });

    const player = createAudioPlayer({ uri }, { updateInterval: 50 });
    this.currentPlayer = player;

    try {
      await new Promise<void>((resolve, reject) => {
        let isDone = false;
        const timeout = setTimeout(() => {
          if (isDone) {
            return;
          }
          isDone = true;
          subscription.remove();
          clearInterval(cancelPoll);
          reject(new Error('Clip playback timeout'));
        }, 30_000);

        const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
          if (isDone) {
            return;
          }

          if (activeJob !== this.jobId) {
            isDone = true;
            subscription.remove();
            clearInterval(cancelPoll);
            clearTimeout(timeout);
            resolve();
            return;
          }

          if (
            status.didJustFinish ||
            (status.isLoaded &&
              !status.playing &&
              status.duration > 0 &&
              status.currentTime >= status.duration - 0.05)
          ) {
            isDone = true;
            subscription.remove();
            clearInterval(cancelPoll);
            clearTimeout(timeout);
            resolve();
          }
        });

        const cancelPoll = setInterval(() => {
          if (isDone) {
            return;
          }

          if (activeJob !== this.jobId) {
            isDone = true;
            subscription.remove();
            clearInterval(cancelPoll);
            clearTimeout(timeout);
            resolve();
          }
        }, 50);

        try {
          player.play();
        } catch (error) {
          if (isDone) {
            return;
          }
          isDone = true;
          subscription.remove();
          clearInterval(cancelPoll);
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error('Clip playback failed'));
        }
      });
    } finally {
      try {
        player.remove();
      } finally {
        if (this.currentPlayer?.id === player.id) {
          this.currentPlayer = null;
        }
      }
    }
  };
}

export const speechEngine = new SpeechEngine();
