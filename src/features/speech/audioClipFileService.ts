import {
  deleteManagedMedia,
  isManagedMediaUri,
  persistManagedMedia,
} from '../../shared/media/mediaStorage';

export const isManagedAudioClipUri = (uri?: string | null): boolean => {
  return isManagedMediaUri(uri);
};

export const persistAudioClip = async (
  clipId: string,
  sourceUri: string
): Promise<string> => {
  return await persistManagedMedia('audio', clipId, sourceUri);
};

export const deleteManagedAudioClip = async (uri?: string | null): Promise<void> => {
  await deleteManagedMedia(uri);
};
