import { useEffect, useState } from 'react';

import { resolveManagedMediaUri } from './mediaStorage';

export const useResolvedMediaUri = (uri?: string | null) => {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const resolveUri = async () => {
      const nextUri = await resolveManagedMediaUri(uri);
      if (!isCancelled) {
        setResolvedUri(nextUri);
      }
    };

    setResolvedUri(null);
    void resolveUri();

    return () => {
      isCancelled = true;
    };
  }, [uri]);

  return resolvedUri;
};
