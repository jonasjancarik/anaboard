import * as FileSystem from 'expo-file-system/legacy';

import { isWebPlatform } from '../platform/runtime';

type ManagedMediaKind = 'audio' | 'image';
type StoredMediaRecord = {
  key: string;
  blob: Blob;
  kind: ManagedMediaKind;
  createdAt: string;
};

const MANAGED_URI_DIRECTORIES: Record<ManagedMediaKind, string> = {
  audio: 'audio-clips',
  image: 'tile-images',
};
const MANAGED_URI_PREFIXES = Object.fromEntries(
  Object.entries(MANAGED_URI_DIRECTORIES).map(([kind, directory]) => [
    kind,
    FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${directory}/` : null,
  ])
) as Record<ManagedMediaKind, string | null>;

const MEDIA_DB_NAME = 'anaboard-media';
const MEDIA_STORE_NAME = 'media_assets';
const MANAGED_MEDIA_URI_PREFIX = 'anaboard-media://';

let databasePromise: Promise<IDBDatabase> | null = null;
const objectUrlCache = new Map<string, string>();

const getFileExtension = (uri: string, fallback: string): string => {
  const match = uri.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  return match?.[1]?.toLowerCase() ?? fallback;
};

const getManagedMediaKey = (uri?: string | null): string | null => {
  if (!uri || !uri.startsWith(MANAGED_MEDIA_URI_PREFIX)) {
    return null;
  }

  return uri.slice(MANAGED_MEDIA_URI_PREFIX.length);
};

const openMediaDatabase = async (): Promise<IDBDatabase> => {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(MEDIA_DB_NAME, 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(MEDIA_STORE_NAME)) {
          database.createObjectStore(MEDIA_STORE_NAME, {
            keyPath: 'key',
          });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Media database open failed'));
      };
    });
  }

  return databasePromise;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T> => {
  const database = await openMediaDatabase();

  return await new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE_NAME, mode);
    const store = transaction.objectStore(MEDIA_STORE_NAME);

    void run(store)
      .then((value) => {
        transaction.oncomplete = () => resolve(value);
        transaction.onerror = () => reject(transaction.error ?? new Error('Media transaction failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Media transaction aborted'));
      })
      .catch((error) => {
        transaction.abort();
        reject(error);
      });
  });
};

const createManagedMediaUri = (kind: ManagedMediaKind, assetId: string): string => {
  if (isWebPlatform) {
    return `${MANAGED_MEDIA_URI_PREFIX}${kind}/${assetId}/${Date.now()}`;
  }

  const directoryUri = MANAGED_URI_PREFIXES[kind];
  if (!directoryUri) {
    throw new Error('Úložiště zařízení není dostupné');
  }

  const fallbackExtension = kind === 'audio' ? 'm4a' : 'jpg';
  return `${directoryUri}${assetId}-${Date.now()}.${fallbackExtension}`;
};

const ensureManagedDirectory = async (kind: ManagedMediaKind): Promise<string> => {
  const directoryUri = MANAGED_URI_PREFIXES[kind];
  if (!directoryUri) {
    throw new Error('Úložiště zařízení není dostupné');
  }

  const info = await FileSystem.getInfoAsync(directoryUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directoryUri, {
      intermediates: true,
    });
  }

  return directoryUri;
};

const loadBlobFromSourceUri = async (sourceUri: string): Promise<Blob> => {
  const response = await fetch(sourceUri);
  if (!response.ok) {
    throw new Error('Médium nešlo načíst do úložiště prohlížeče.');
  }

  return await response.blob();
};

export const isManagedMediaUri = (uri?: string | null): boolean => {
  if (!uri) {
    return false;
  }

  if (isWebPlatform) {
    return Boolean(getManagedMediaKey(uri));
  }

  return Object.values(MANAGED_URI_PREFIXES).some((prefix) => (prefix ? uri.startsWith(prefix) : false));
};

export const persistManagedMedia = async (
  kind: ManagedMediaKind,
  assetId: string,
  sourceUri: string
): Promise<string> => {
  if (isWebPlatform) {
    const blob = await loadBlobFromSourceUri(sourceUri);
    const uri = createManagedMediaUri(kind, assetId);
    const key = getManagedMediaKey(uri);
    if (!key) {
      throw new Error('Nepovedlo se připravit klíč média pro prohlížeč.');
    }

    await withStore('readwrite', async (store) => {
      await requestToPromise(
        store.put({
          key,
          blob,
          kind,
          createdAt: new Date().toISOString(),
        } satisfies StoredMediaRecord)
      );
    });

    return uri;
  }

  const directoryUri = await ensureManagedDirectory(kind);
  const fallbackExtension = kind === 'audio' ? 'm4a' : 'jpg';
  const extension = getFileExtension(sourceUri, fallbackExtension);
  const targetUri = `${directoryUri}${assetId}-${Date.now()}.${extension}`;

  await FileSystem.copyAsync({
    from: sourceUri,
    to: targetUri,
  });

  return targetUri;
};

export const persistManagedMediaFromRemoteUrl = async (
  kind: ManagedMediaKind,
  assetId: string,
  sourceUrl: string,
  extension?: string
): Promise<string> => {
  if (isWebPlatform) {
    const blob = await loadBlobFromSourceUri(sourceUrl);
    const uri = createManagedMediaUri(kind, assetId);
    const key = getManagedMediaKey(uri);
    if (!key) {
      throw new Error('Nepovedlo se připravit klíč média pro prohlížeč.');
    }

    await withStore('readwrite', async (store) => {
      await requestToPromise(
        store.put({
          key,
          blob,
          kind,
          createdAt: new Date().toISOString(),
        } satisfies StoredMediaRecord)
      );
    });

    return uri;
  }

  const directoryUri = await ensureManagedDirectory(kind);
  const fallbackExtension = kind === 'audio' ? 'm4a' : 'jpg';
  const targetUri = `${directoryUri}${assetId}-${Date.now()}.${extension ?? fallbackExtension}`;

  await FileSystem.downloadAsync(sourceUrl, targetUri);

  return targetUri;
};

export const deleteManagedMedia = async (uri?: string | null): Promise<void> => {
  if (!uri || !isManagedMediaUri(uri)) {
    return;
  }

  if (isWebPlatform) {
    const key = getManagedMediaKey(uri);
    if (!key) {
      return;
    }

    const cachedObjectUrl = objectUrlCache.get(uri);
    if (cachedObjectUrl) {
      URL.revokeObjectURL(cachedObjectUrl);
      objectUrlCache.delete(uri);
    }

    await withStore('readwrite', async (store) => {
      await requestToPromise(store.delete(key));
    });
    return;
  }

  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    return;
  }

  await FileSystem.deleteAsync(uri);
};

export const resolveManagedMediaUri = async (uri?: string | null): Promise<string | null> => {
  if (!uri) {
    return null;
  }

  if (!isWebPlatform) {
    return uri;
  }

  const key = getManagedMediaKey(uri);
  if (!key) {
    return uri;
  }

  const cachedObjectUrl = objectUrlCache.get(uri);
  if (cachedObjectUrl) {
    return cachedObjectUrl;
  }

  const blob = await withStore('readonly', async (store) => {
    const record = await requestToPromise(store.get(key));
    return (record as StoredMediaRecord | undefined)?.blob ?? null;
  });

  if (!blob) {
    return null;
  }

  const objectUrl = URL.createObjectURL(blob);
  objectUrlCache.set(uri, objectUrl);
  return objectUrl;
};

export const mediaAssetExists = async (uri?: string | null): Promise<boolean> => {
  if (!uri) {
    return false;
  }

  if (!isManagedMediaUri(uri)) {
    return true;
  }

  if (isWebPlatform) {
    const key = getManagedMediaKey(uri);
    if (!key) {
      return false;
    }

    return await withStore('readonly', async (store) => {
      const record = await requestToPromise(store.get(key));
      return Boolean(record);
    });
  }

  const info = await FileSystem.getInfoAsync(uri);
  return Boolean(info.exists);
};
