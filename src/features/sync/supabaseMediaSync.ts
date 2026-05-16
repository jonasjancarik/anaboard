import { persistManagedMediaFromRemoteUrl } from '../../shared/media/mediaStorage';
import { supabaseClient } from '../../shared/services/supabaseClient';
import type { RemoteContext } from '../auth/types';

const AUDIO_BUCKET = 'audio-clips';
const IMAGE_BUCKET = 'tile-images';

const getExtension = (value: string, fallback: string): string => {
  const match = value.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  return match?.[1]?.toLowerCase() ?? fallback;
};

const getMimeType = (kind: 'audio' | 'image', extension: string): string => {
  const normalized = extension.toLowerCase();
  if (kind === 'audio') {
    if (normalized === 'm4a') {
      return 'audio/mp4';
    }

    if (normalized === 'mp3') {
      return 'audio/mpeg';
    }

    if (normalized === 'wav') {
      return 'audio/wav';
    }

    return 'application/octet-stream';
  }

  if (normalized === 'png') {
    return 'image/png';
  }

  if (normalized === 'webp') {
    return 'image/webp';
  }

  return 'image/jpeg';
};

const uploadBinary = async (
  bucket: string,
  path: string,
  localUri: string,
  contentType: string
): Promise<void> => {
  if (!supabaseClient) {
    throw new Error('Supabase client missing');
  }

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error('Soubor pro cloud sync nešel načíst.');
  }

  const body = await response.arrayBuffer();
  const { error } = await supabaseClient.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw error;
  }
};

const createSignedUrl = async (bucket: string, path: string): Promise<string> => {
  if (!supabaseClient) {
    throw new Error('Supabase client missing');
  }

  const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('Podepsaná adresa média nevznikla.');
  }

  return data.signedUrl;
};

export const buildRemoteAudioPath = (
  context: RemoteContext,
  clipId: string,
  format: string
): string => {
  const extension = getExtension(format, 'm4a');
  return `${context.familyId}/${context.profileId}/${clipId}.${extension}`;
};

export const buildRemoteTileImagePath = (
  context: RemoteContext,
  tileId: string,
  sourceUri: string
): string => {
  const extension = getExtension(sourceUri, 'jpg');
  return `${context.familyId}/${context.profileId}/${tileId}.${extension}`;
};

export const uploadAudioClipToSupabase = async (
  context: RemoteContext,
  clipId: string,
  localUri: string,
  format: string
): Promise<string> => {
  const remotePath = buildRemoteAudioPath(context, clipId, format);
  await uploadBinary(AUDIO_BUCKET, remotePath, localUri, getMimeType('audio', format));
  return remotePath;
};

export const uploadTileImageToSupabase = async (
  context: RemoteContext,
  tileId: string,
  localUri: string
): Promise<string> => {
  const remotePath = buildRemoteTileImagePath(context, tileId, localUri);
  await uploadBinary(
    IMAGE_BUCKET,
    remotePath,
    localUri,
    getMimeType('image', getExtension(localUri, 'jpg'))
  );
  return remotePath;
};

export const downloadAudioClipFromSupabase = async (
  clipId: string,
  remotePath: string
): Promise<string> => {
  const signedUrl = await createSignedUrl(AUDIO_BUCKET, remotePath);
  return persistManagedMediaFromRemoteUrl(
    'audio',
    clipId,
    signedUrl,
    getExtension(remotePath, 'm4a')
  );
};

export const downloadTileImageFromSupabase = async (
  tileId: string,
  remotePath: string
): Promise<string> => {
  const signedUrl = await createSignedUrl(IMAGE_BUCKET, remotePath);
  return persistManagedMediaFromRemoteUrl(
    'image',
    tileId,
    signedUrl,
    getExtension(remotePath, 'jpg')
  );
};
