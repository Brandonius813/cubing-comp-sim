import { isEventId } from '../core/events';
import { EVENT_CATEGORIES, type SafeProperties, type TelemetryEventName } from './types';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILD_ID = /^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,79}$/;
// Accept the actual pinned engine identifier, without allowing arbitrary @ strings/emails.
const ENGINE_BUILD_ID = /^tnoodle-lib@[a-f0-9]{40}\+webcrypto\.[1-9][0-9]*$/;
const CODES = new Set([
  'UNKNOWN', 'QUOTA_EXCEEDED', 'STORAGE_UNAVAILABLE', 'TRANSACTION_FAILED',
  'MIGRATION_FAILED', 'INVALID_DATA', 'ENGINE_UNAVAILABLE', 'GENERATION_FAILED',
  'UNSUPPORTED_EVENT', 'DISPOSED', 'NETWORK_ERROR', 'AUTH_REQUIRED',
  'REVISION_CONFLICT', 'CHECKSUM_MISMATCH', 'UNSUPPORTED_SCHEMA',
]);
const ENUMS: Record<string, readonly string[]> = {
  inputMode: ['timer', 'manual'],
  format: ['ao5', 'mo3', 'bo3', 'bo5'],
  direction: ['upload', 'download'],
  outcome: ['success', 'failed', 'cancelled', 'conflict'],
  operation: ['save_result', 'save_round', 'import', 'download', 'upload', 'migration', 'startup'],
  phase: ['idle', 'preparing', 'scramble', 'waiting', 'ready', 'inspection', 'solving', 'result', 'saving', 'completed', 'interrupted'],
  latencyBucket: ['under_100ms', 'under_1s', 'under_5s', 'under_30s', 'over_30s'],
  sizeBucket: ['under_100kb', 'under_1mb', 'under_10mb', 'over_10mb'],
};
const FIELDS: Record<TelemetryEventName, readonly string[]> = {
  round_started: ['eventId', 'inputMode', 'roundToken'],
  attempt_recorded: ['eventId', 'inputMode', 'attemptToken', 'roundToken'],
  round_completed: ['eventId', 'format', 'attemptCount', 'roundToken'],
  offline_assets_ready: ['engineVersion'],
  cloud_transfer_result: ['direction', 'outcome', 'sizeBucket', 'latencyBucket', 'operationToken'],
  local_save_failed: ['eventId', 'code', 'operation', 'phase'],
  scramble_failed: ['eventId', 'engineVersion', 'code', 'phase'],
  client_error: ['code', 'operation', 'phase'],
};

export function isTelemetryEventName(value: unknown): value is TelemetryEventName {
  return typeof value === 'string' && Object.hasOwn(EVENT_CATEGORIES, value);
}

export function safeBuildId(value: unknown): string | undefined {
  return typeof value === 'string' && BUILD_ID.test(value) ? value : undefined;
}

/** Rebuild from approved fields and approved values, including when loading an old outbox. */
export function sanitizeProperties(name: TelemetryEventName, input: Record<string, unknown>): SafeProperties {
  const result: SafeProperties = {};
  for (const key of FIELDS[name]) {
    const value = input[key];
    if (key === 'eventId' && isEventId(value)) result[key] = value;
    else if (key === 'code' && typeof value === 'string' && CODES.has(value)) result[key] = value;
    else if (key === 'attemptCount' && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5) result[key] = Number(value);
    else if (key.endsWith('Token') && typeof value === 'string' && UUID.test(value)) result[key] = value;
    else if (key === 'engineVersion' && typeof value === 'string' && (safeBuildId(value) || ENGINE_BUILD_ID.test(value))) result[key] = value;
    else if (ENUMS[key]?.includes(value as string)) result[key] = value as string;
  }
  return result;
}
