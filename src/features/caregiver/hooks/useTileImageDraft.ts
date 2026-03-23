import { useEffect, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";

import type { TileVisualType } from "../../../shared/types/domain";
import {
  deleteManagedTileImage,
  persistTileImage,
} from "../services/tileImageService";

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
  onError: (message: string | null) => void;
};

export const useTileImageDraft = ({
  tileId,
  initialVisualType,
  initialImageLocalUri,
  initialImageRemotePath,
  onError,
}: UseTileImageDraftParams) => {
  const draftImageUrisRef = useRef<Set<string>>(new Set());

  const [visualType, setVisualType] = useState<TileVisualType>(initialVisualType);
  const [imageLocalUri, setImageLocalUri] = useState<string | null>(
    initialImageLocalUri ?? null
  );
  const [imageRemotePath, setImageRemotePath] = useState<string | null>(
    initialImageRemotePath ?? null
  );

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
      onError("Fotku nešlo načíst.");
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
      onError(error instanceof Error ? error.message : "Fotku nešlo uložit");
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
        onError("Bez přístupu k fotkám nejde obrázek vybrat.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync(imagePickerOptions);
      await handlePickedImage(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Výběr fotky selhal");
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
        onError("Bez přístupu k foťáku nejde fotku pořídit.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync(imagePickerOptions);
      await handlePickedImage(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Pořízení fotky selhalo");
    }
  };

  const removeImage = async () => {
    onError(null);
    await discardDraftImage(imageLocalUri);
    setImageLocalUri(null);
    setImageRemotePath(null);
    setVisualType("emoji");
  };

  const commitDraft = async (persistCurrentImage: boolean) => {
    if (persistCurrentImage && imageLocalUri) {
      draftImageUrisRef.current.delete(imageLocalUri);
      return;
    }

    await discardDraftImage(imageLocalUri);
  };

  return {
    visualType,
    setVisualType,
    imageLocalUri,
    imageRemotePath,
    hasPreviewImage: Boolean(imageLocalUri || imageRemotePath),
    pickImageFromLibrary,
    takePhoto,
    removeImage,
    commitDraft,
  };
};
