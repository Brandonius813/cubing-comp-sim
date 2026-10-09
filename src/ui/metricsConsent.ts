import { telemetry, type TelemetryConsent } from '../telemetry';

const KEY = 'ccs-telemetry-consent';
export function loadMetricsConsent(): TelemetryConsent {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object') return { product: 'product' in saved && saved.product === true, diagnostics: 'diagnostics' in saved && saved.diagnostics === true };
  } catch { /* Privacy defaults to no collection when preferences cannot be read. */ }
  return { product: false, diagnostics: false };
}
export function saveMetricsConsent(consent: TelemetryConsent) {
  localStorage.setItem(KEY, JSON.stringify(consent));
  telemetry.setConsent(consent);
}
