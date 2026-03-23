import * as FileSystem from 'expo-file-system/legacy';

const TILE_IMAGE_DIRECTORY_NAME = 'tile-images';
const TILE_IMAGE_DIRECTORY_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${TILE_IMAGE_DIRECTORY_NAME}/`
  : null;

const getFileExtension = (uri: string): string => {
  const match = uri.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  return match?.[1]?.toLowerCase() ?? 'jpg';
};

const ensureTileImageDirectory = async (): Promise<string> => {
  if (!TILE_IMAGE_DIRECTORY_URI) {
    throw new Error('Úložiště zařízení není dostupné');
  }

  const info = await FileSystem.getInfoAsync(TILE_IMAGE_DIRECTORY_URI);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(TILE_IMAGE_DIRECTORY_URI, {
      intermediates: true,
    });
  }

  return TILE_IMAGE_DIRECTORY_URI;
};

export const isManagedTileImageUri = (uri?: string | null): boolean => {
  if (!uri || !TILE_IMAGE_DIRECTORY_URI) {
    return false;
  }

  return uri.startsWith(TILE_IMAGE_DIRECTORY_URI);
};

export const persistTileImage = async (
  tileId: string,
  sourceUri: string
): Promise<string> => {
  const directoryUri = await ensureTileImageDirectory();
  const fileExtension = getFileExtension(sourceUri);
  const targetUri = `${directoryUri}${tileId}-${Date.now()}.${fileExtension}`;

  await FileSystem.copyAsync({
    from: sourceUri,
    to: targetUri,
  });

  return targetUri;
};

export const deleteManagedTileImage = async (uri?: string | null): Promise<void> => {
  if (!isManagedTileImageUri(uri)) {
    return;
  }

  if (!uri) {
    return;
  }

  const managedUri: string = uri;
  const info = await FileSystem.getInfoAsync(managedUri);
  if (!info.exists) {
    return;
  }

  await FileSystem.deleteAsync(managedUri);
};
