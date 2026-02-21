import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
} from 'expo-audio';

export type RecordingResult = {
  uri: string;
  durationMs: number;
};

class RecordingService {
  private recording: AudioRecorder | null = null;

  public start = async (): Promise<void> => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Permission denied');
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });

    const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();
    this.recording = recorder;
  };

  public stop = async (): Promise<RecordingResult | null> => {
    if (!this.recording) {
      return null;
    }

    const activeRecording = this.recording;
    this.recording = null;

    await activeRecording.stop();
    const status = activeRecording.getStatus();
    const uri = activeRecording.uri ?? status.url;

    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });

    if (!uri) {
      return null;
    }

    return {
      uri,
      durationMs: status.durationMillis ?? 0,
    };
  };

  public cancel = async (): Promise<void> => {
    if (!this.recording) {
      return;
    }

    const activeRecording = this.recording;
    this.recording = null;

    try {
      await activeRecording.stop();
    } catch {
      // best effort
    } finally {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'duckOthers',
      });
    }
  };
}

export const recordingService = new RecordingService();
