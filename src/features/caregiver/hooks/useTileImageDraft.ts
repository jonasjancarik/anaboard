import { useEffect, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";

import type { TileVisualType } from "../../../shared/types/domain";
import {
  deleteManagedTileImage,
  persistTileImage,
} from "../services/tileImageService";
import { getAppCopy } from "../../../shared/i18n/appCopy";

const imagePickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.7,
};

type UseTileImageDraftParams = {
  tileId: string | null;
  initialVisualType: TileVisualType;
  initialImageLocalUri?: string | null;
  initialImageRemotePath?: string | null;
  locale?: unknown;
  onError: (message: string | null) => void;
};

export type GeneratedTileImageDraft = {
  draftId: string;
  storagePath: string;
  previewUrl: string;
  localUri?: string | null;
};

export const useTileImageDraft = ({
  tileId,
  initialVisualType,
  initialImageLocalUri,
  initialImageRemotePath,
  locale,
  onError,
}: UseTileImageDraftParams) => {
  const copy = getAppCopy(locale).tileImageDraftErrors;
  const draftImageUrisRef = useRef<Set<string>>(new Set());

  const [visualType, setVisualType] = useState<TileVisualType>(initialVisualType);
  const [imageLocalUri, setImageLocalUri] = useState<string | null>(
    initialImageLocalUri ?? null
  );
  const [imageRemotePath, setImageRemotePath] = useState<string | null>(
    initialImageRemotePath ?? null
  );
  const [generatedDraft, setGeneratedDraft] =
    useState<GeneratedTileImageDraft | null>(null);

  const discardDraftImage = async (uri?: string | null) => {
    if (!uri || !draftImageUrisRef.current.has(uri)) {
      return;
    }

    draftImageUrisRef.current.delete(uri);
    await deleteManagedTileImage(uri);
  };

  const discardAllDraftImages = async () => {
    const uris = [...draftImageUrisRef.current];
    draftImageUrisRef.current.clear();
    await Promise.all(uris.map((uri) => deleteManagedTileImage(uri)));
  };

  useEffect(() => {
    void discardAllDraftImages();
    setVisualType(initialVisualType);
    setImageLocalUri(initialImageLocalUri ?? null);
    setImageRemotePath(initialImageRemotePath ?? null);
    setGeneratedDraft(null);
  }, [tileId]);

  useEffect(() => {
    return () => {
      void discardAllDraftImages();
    };
  }, []);

  const handlePickedImage = async (
    result: ImagePicker.ImagePickerResult
  ): Promise<void> => {
    if (!tileId || result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset?.uri) {
      onError(copy.loadPhoto);
      return;
    }

    try {
      await discardDraftImage(imageLocalUri);
      const persistedUri = await persistTileImage(tileId, asset.uri);
      draftImageUrisRef.current.add(persistedUri);
      setImageLocalUri(persistedUri);
      setImageRemotePath(null);
      setVisualType("image");
      onError(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : copy.savePhoto);
    }
  };

  const pickImageFromLibrary = async () => {
    if (!tileId) {
      return;
    }

    onError(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        onError(copy.photoPermission);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync(imagePickerOptions);
      await handlePickedImage(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : copy.photoPick);
    }
  };

  const takePhoto = async () => {
    if (!tileId) {
      return;
    }

    onError(null);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        onError(copy.cameraPermission);
        return;
      }

      const result = await ImagePicker.launchCameraAsync(imagePickerOptions);
      await handlePickedImage(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : copy.cameraCapture);
    }
  };

  const removeImage = async () => {
    onError(null);
    await discardDraftImage(imageLocalUri);
    setImageLocalUri(null);
    setImageRemotePath(null);
    setGeneratedDraft(null);
    setVisualType("emoji");
  };

  const setGeneratedDraftPreview = (draft: GeneratedTileImageDraft) => {
    if (draft.localUri) {
      draftImageUrisRef.current.add(draft.localUri);
    }
    setGeneratedDraft(draft);
  };

  const clearGeneratedDraft = () => {
    setGeneratedDraft(null);
  };

  const applyGeneratedDraft = async (params: {
    localUri: string;
    remotePath: string;
  }) => {
    await discardDraftImage(imageLocalUri);
    draftImageUrisRef.current.add(params.localUri);
    setImageLocalUri(params.localUri);
    setImageRemotePath(params.remotePath);
    setGeneratedDraft(null);
    setVisualType("image");
  };

  const commitDraft = async (
    persistCurrentImage: boolean,
    persistedImageLocalUri?: string | null
  ) => {
    const nextPersistedImageLocalUri =
      persistedImageLocalUri === undefined ? imageLocalUri : persistedImageLocalUri;

    if (persistCurrentImage && nextPersistedImageLocalUri) {
      draftImageUrisRef.current.delete(nextPersistedImageLocalUri);
      setGeneratedDraft(null);
      return;
    }

    await discardDraftImage(nextPersistedImageLocalUri);
    setGeneratedDraft(null);
  };

  return {
    visualType,
    setVisualType,
    imageLocalUri,
    imageRemotePath,
    previewImageLocalUri:
      generatedDraft?.localUri ?? (generatedDraft ? null : imageLocalUri),
    previewImageRemotePath: generatedDraft?.previewUrl ?? imageRemotePath,
    generatedDraft,
    hasPreviewImage: Boolean(imageLocalUri || generatedDraft?.previewUrl || imageRemotePath),
    setGeneratedDraftPreview,
    clearGeneratedDraft,
    applyGeneratedDraft,
    pickImageFromLibrary,
    takePhoto,
    removeImage,
    commitDraft,
  };
};
