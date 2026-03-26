import { isWebPlatform } from './runtime';

export type WebStorageSupportResult = {
  supported: boolean;
  message: string;
};

const PROBE_DIRECTORY_NAME = 'anaboard-storage-probe';
const PROBE_FILE_NAME = 'probe.bin';

const unsupported = (message: string): WebStorageSupportResult => ({
  supported: false,
  message,
});

export const getWebStorageSupport = async (): Promise<WebStorageSupportResult> => {
  if (!isWebPlatform) {
    return {
      supported: true,
      message: '',
    };
  }

  if (!window.isSecureContext) {
    return unsupported('ÁňaBoard v prohlížeči potřebuje bezpečné HTTPS úložiště.');
  }

  if (!navigator.storage?.getDirectory) {
    return unsupported('Tento prohlížeč neumí trvalé úložiště potřebné pro ÁňaBoard.');
  }

  try {
    const rootDirectory = await navigator.storage.getDirectory();
    const probeDirectory = await rootDirectory.getDirectoryHandle(PROBE_DIRECTORY_NAME, {
      create: true,
    });
    await probeDirectory.getFileHandle(PROBE_FILE_NAME, {
      create: true,
    });

    await probeDirectory.removeEntry(PROBE_FILE_NAME);
    try {
      await rootDirectory.removeEntry(PROBE_DIRECTORY_NAME, { recursive: true });
    } catch {
      // Best effort cleanup.
    }

    try {
      await navigator.storage.persist?.();
    } catch {
      // Best effort only.
    }

    return {
      supported: true,
      message: '',
    };
  } catch {
    return unsupported('Prohlížeč neotevřel trvalé úložiště ÁňaBoardu.');
  }
};
