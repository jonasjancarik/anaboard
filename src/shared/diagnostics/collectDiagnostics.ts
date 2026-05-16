import * as Application from 'expo-application';
import { Platform } from 'react-native';

import {
  buildDiagnosticsPayload,
  type DiagnosticsBuildInput,
  type DiagnosticsPayload,
} from './buildDiagnosticsPayload';
import { isWebPlatform } from '../platform/runtime';
import { getWebPersistenceSmokeSummary } from '../storage/webPersistenceSmoke';
import { getTelemetryRecords } from '../telemetry/logger';

export type CollectDiagnosticsInput = Omit<
  DiagnosticsBuildInput,
  'generatedAt' | 'appVersion' | 'platform' | 'webPersistenceSummary' | 'telemetryRecords'
> & {
  webPersistenceSummary?: DiagnosticsBuildInput['webPersistenceSummary'];
};

export const collectDiagnosticsPayload = async (
  input: CollectDiagnosticsInput
): Promise<DiagnosticsPayload> => {
  const [telemetryRecords, webPersistenceSummary] = await Promise.all([
    getTelemetryRecords(),
    input.webPersistenceSummary !== undefined || !isWebPlatform
      ? Promise.resolve(input.webPersistenceSummary)
      : getWebPersistenceSmokeSummary().catch(() => null),
  ]);

  return buildDiagnosticsPayload({
    ...input,
    generatedAt: new Date().toISOString(),
    appVersion: Application.nativeApplicationVersion ?? 'dev',
    platform: Platform.OS,
    webPersistenceSummary,
    telemetryRecords,
  });
};
