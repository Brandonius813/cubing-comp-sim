import { createTelemetry } from './client';
import { createPostHogSink } from './posthog';
import { createIndexedDbOutbox } from './store';

export { createTelemetry, MAX_AGE_MS, MAX_EVENTS } from './client';
export type { TelemetryClient, TelemetryOptions } from './client';
export type { TelemetryConsent, TelemetryStatus, DiagnosticSink, ProductEventName, DiagnosticEventName } from './types';

/** No identifiers, storage access, or requests occur merely by importing this module. */
export const telemetry = createTelemetry({
  store: createIndexedDbOutbox(),
  productSink: createPostHogSink({ key: import.meta.env.VITE_POSTHOG_KEY, host: import.meta.env.VITE_POSTHOG_HOST }),
  appVersion: import.meta.env.VITE_APP_VERSION ?? '0.1.0',
  // No Sentry dependency is configured yet. Diagnostics must remain visibly unavailable.
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void telemetry.flush(); });
}
