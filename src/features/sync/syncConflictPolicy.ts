export type LocalChangeDecision = {
  shouldApply: boolean;
  reason: 'forced' | 'no_remote' | 'local_newer_or_equal' | 'remote_newer';
};

const parseSyncTimestamp = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const shouldApplyLocalChange = (params: {
  localChangedAt?: string | null;
  remoteChangedAt?: string | null;
  force?: boolean;
}): LocalChangeDecision => {
  if (params.force) {
    return {
      shouldApply: true,
      reason: 'forced',
    };
  }

  const remoteTimestamp = parseSyncTimestamp(params.remoteChangedAt);
  if (remoteTimestamp === null) {
    return {
      shouldApply: true,
      reason: 'no_remote',
    };
  }

  const localTimestamp = parseSyncTimestamp(params.localChangedAt);
  if (localTimestamp === null || localTimestamp >= remoteTimestamp) {
    return {
      shouldApply: true,
      reason: 'local_newer_or_equal',
    };
  }

  return {
    shouldApply: false,
    reason: 'remote_newer',
  };
};
