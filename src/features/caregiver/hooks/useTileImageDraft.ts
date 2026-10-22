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

const MAX_GENERATED_DRAFTS = 3;

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
  const [generatedDrafts, setGeneratedDrafts] = useState<
    GeneratedTileImageDraft[]
  >([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const selectedDraft =
    visualType === "image"
      ? (generatedDrafts.find((draft) => draft.draftId === selectedDraftId) ??
        null)
      : null;

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
    setGeneratedDrafts([]);
    setSelectedDraftId(null);
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
      setSelectedDraftId(null);
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
    setSelectedDraftId(null);
    setVisualType("emoji");
  };

  const chooseEmojiVisual = () => {
    setSelectedDraftId(null);
    setVisualType("emoji");
  };

  // Newest first; the new draft becomes the chosen tile image until Save.
  const addGeneratedDraft = (draft: GeneratedTileImageDraft) => {
    if (draft.localUri) {
      draftImageUrisRef.current.add(draft.localUri);
    }

    const nextDrafts = [draft, ...generatedDrafts];
    const evicted = nextDrafts.slice(MAX_GENERATED_DRAFTS);
    evicted.forEach((item) => {
      void discardDraftImage(item.localUri);
    });
    setGeneratedDrafts(nextDrafts.slice(0, MAX_GENERATED_DRAFTS));
    setSelectedDraftId(draft.draftId);
    setVisualType("image");
  };

  const selectGeneratedDraft = (draftId: string) => {
    setSelectedDraftId(draftId);
    setVisualType("image");
  };

  const applyGeneratedDraft = async (params: {
    localUri: string;
    remotePath: string;
  }) => {
    await discardDraftImage(imageLocalUri);
    await Promise.all(
      generatedDrafts
        .filter((draft) => draft.localUri && draft.localUri !== params.localUri)
        .map((draft) => discardDraftImage(draft.localUri)),
    );
    draftImageUrisRef.current.add(params.localUri);
    setImageLocalUri(params.localUri);
    setImageRemotePath(params.remotePath);
    setGeneratedDrafts([]);
    setSelectedDraftId(null);
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
      return;
    }

    await discardDraftImage(nextPersistedImageLocalUri);
  };

  return {
    visualType,
    imageLocalUri,
    imageRemotePath,
    previewImageLocalUri: selectedDraft
      ? (selectedDraft.localUri ?? null)
      : imageLocalUri,
    previewImageRemotePath: selectedDraft
      ? selectedDraft.previewUrl
      : imageRemotePath,
    generatedDrafts,
    selectedDraft,
    hasPreviewImage: Boolean(selectedDraft || imageLocalUri || imageRemotePath),
    chooseEmojiVisual,
    addGeneratedDraft,
    selectGeneratedDraft,
    applyGeneratedDraft,
    pickImageFromLibrary,
    takePhoto,
    removeImage,
    commitDraft,
  };
};
