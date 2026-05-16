import { Share } from 'react-native';

import {
  serializeDiagnosticsPayload,
  type DiagnosticsPayload,
} from './buildDiagnosticsPayload';
import { isWebPlatform } from '../platform/runtime';

export type DiagnosticsShareResult = 'shared' | 'mail' | 'download';

const DIAGNOSTICS_SHARE_TITLE = 'ÁňaBoard diagnostika';
const MAILTO_LENGTH_LIMIT = 1800;

const canUseWebShare = (): boolean => {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  );
};

const openWebMailDraft = (body: string): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const mailtoUrl = `mailto:?subject=${encodeURIComponent(
    DIAGNOSTICS_SHARE_TITLE
  )}&body=${encodeURIComponent(body)}`;

  if (mailtoUrl.length > MAILTO_LENGTH_LIMIT) {
    return false;
  }

  window.location.href = mailtoUrl;
  return true;
};

const downloadWebDiagnosticsFile = (body: string): void => {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('Web diagnostics download is not available.');
  }

  const blob = new Blob([body], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  anchor.href = url;
  anchor.download = `anaboard-diagnostics-${timestamp}.json`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const shareDiagnosticsPayload = async (
  payload: DiagnosticsPayload
): Promise<DiagnosticsShareResult> => {
  const body = serializeDiagnosticsPayload(payload);

  if (!isWebPlatform) {
    await Share.share({
      title: DIAGNOSTICS_SHARE_TITLE,
      message: body,
    }, {
      subject: DIAGNOSTICS_SHARE_TITLE,
    });
    return 'shared';
  }

  if (canUseWebShare()) {
    try {
      await navigator.share({
        title: DIAGNOSTICS_SHARE_TITLE,
        text: body,
      });
      return 'shared';
    } catch {
      // Fall back to mail/download if Web Share is unavailable or cancelled.
    }
  }

  if (openWebMailDraft(body)) {
    return 'mail';
  }

  downloadWebDiagnosticsFile(body);
  return 'download';
};
