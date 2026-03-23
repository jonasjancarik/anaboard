import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import * as Speech from 'expo-speech';

import { mediaAssetExists, resolveManagedMediaUri } from '../../shared/media/mediaStorage';
import { logError, logEvent } from '../../shared/telemetry/logger';
import type { AudioClip, ProfileSettings, SentenceToken, SpeechSegment, Tile } from '../../shared/types/domain';
import { sleep } from '../../shared/utils/time';

const INTER_SEGMENT_PAUSE_MS = 120;

type SegmentBuildInput = {
  tokens: SentenceToken[];
  tilesById: Record<string, Tile>;
  clipsById: Record<string, AudioClip>;
};

const estimateTextDuration = (text: string): number => Math.max(500, text.length * 90);

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

  private settings: Pick<ProfileSettings, 'ttsRate' | 'ttsPitch' | 'preferredVoice'> = {
    ttsRate: 0.86,
    ttsPitch: 1,
    preferredVoice: undefined,
  };

  public setSettings(settings: Pick<ProfileSettings, 'ttsRate' | 'ttsPitch' | 'preferredVoice'>): void {
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
    settings: Pick<ProfileSettings, 'ttsRate' | 'ttsPitch' | 'preferredVoice'>
  ): Promise<void> => {
    await this.cancel();
    this.jobId += 1;
    const activeJob = this.jobId;
    await this.playTts(text, activeJob, settings);
  };

  private playTts = async (
    text: string,
    activeJob: number,
    settingsOverride?: Pick<ProfileSettings, 'ttsRate' | 'ttsPitch' | 'preferredVoice'>
  ): Promise<void> => {
    if (!text.trim()) {
      return;
    }

    const settings = settingsOverride ?? this.settings;

    await new Promise<void>((resolve, reject) => {
      Speech.speak(text, {
        language: 'cs-CZ',
        rate: settings.ttsRate,
        pitch: settings.ttsPitch,
        voice: settings.preferredVoice,
        onDone: () => {
          if (activeJob === this.jobId) {
            resolve();
          }
        },
        onStopped: () => {
          resolve();
        },
        onError: (error) => {
          reject(error);
        },
      });
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
