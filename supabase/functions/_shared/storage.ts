export const TILE_IMAGES_BUCKET = 'tile-images';

export const buildTileImagePath = (
  familyId: string,
  profileId: string,
  tileId: string,
  extension: string
): string => {
  return `${familyId}/${profileId}/${tileId}.${extension}`;
};

export const buildAnonymousTileImagePath = (
  userId: string,
  tileId: string,
  extension: string
): string => {
  return `trials/${userId}/tiles/${tileId}.${extension}`;
};

export const buildTileImageDraftPath = (
  familyId: string,
  profileId: string,
  draftId: string,
  extension: string
): string => {
  return `${familyId}/${profileId}/ai-drafts/${draftId}.${extension}`;
};

export const buildAnonymousTileImageDraftPath = (
  userId: string,
  draftId: string,
  extension: string
): string => {
  return `trials/${userId}/ai-drafts/${draftId}.${extension}`;
};
