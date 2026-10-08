export type TelemetryCategory = 'product' | 'diagnostics';
export interface TelemetryConsent { product: boolean; diagnostics: boolean }

export const EVENT_CATEGORIES = {
  round_started: 'product',
  attempt_recorded: 'product',
  round_completed: 'product',
  offline_assets_ready: 'product',
  cloud_transfer_result: 'product',
  local_save_failed: 'diagnostics',
  scramble_failed: 'diagnostics',
  client_error: 'diagnostics',
} as const;

export type TelemetryEventName = keyof typeof EVENT_CATEGORIES;
export type ProductEventName = { [K in TelemetryEventName]: typeof EVENT_CATEGORIES[K] extends 'product' ? K : never }[TelemetryEventName];
export type DiagnosticEventName = Exclude<TelemetryEventName, ProductEventName>;
export type SafeProperties = Record<string, string | number>;

/** Only sanitized metadata crosses this boundary. Never pass Error objects or histories. */
export interface TelemetryEvent {
  id: string;
  name: TelemetryEventName;
  timestamp: string;
  distinctId: string;
  properties: SafeProperties;
}

export interface OutboxState {
  version: 1;
  identities: Partial<Record<TelemetryCategory, string>>;
  events: TelemetryEvent[];
}

export interface OutboxStore {
  read(): Promise<unknown>;
  write(state: OutboxState): Promise<void>;
}

export interface EventSink {
  send(events: readonly TelemetryEvent[], signal: AbortSignal): Promise<void>;
}

/** An error provider must be explicitly supplied. No placeholder reports success. */
export type DiagnosticSink = EventSink;

export interface TelemetryStatus {
  productConfigured: boolean;
  diagnosticsConfigured: boolean;
  consent: TelemetryConsent;
  queued: number;
}
