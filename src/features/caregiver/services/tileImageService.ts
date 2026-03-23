import {
  deleteManagedMedia,
  isManagedMediaUri,
  persistManagedMedia,
} from '../../../shared/media/mediaStorage';

export const isManagedTileImageUri = (uri?: string | null): boolean => {
  return isManagedMediaUri(uri);
};

export const persistTileImage = async (
  tileId: string,
  sourceUri: string
): Promise<string> => {
  return await persistManagedMedia('image', tileId, sourceUri);
};

export const deleteManagedTileImage = async (uri?: string | null): Promise<void> => {
  await deleteManagedMedia(uri);
};
