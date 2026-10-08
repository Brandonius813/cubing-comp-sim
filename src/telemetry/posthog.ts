import type { EventSink } from './types';

export interface PostHogConfig { key?: string; host?: string }

/** Public capture API: https://posthog.com/docs/api/capture. No autocapture SDK. */
export function createPostHogSink(config: PostHogConfig, fetcher: typeof fetch = fetch): EventSink | undefined {
  if (!config.key?.trim() || !config.host) return undefined;
  let origin: string;
  try {
    const url = new URL(config.host);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return undefined;
    origin = url.origin;
  } catch { return undefined; }
  return {
    async send(events, signal) {
      const response = await fetcher(`${origin}/batch/`, {
        method: 'POST',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: config.key,
          batch: events.map(event => ({
            uuid: event.id,
            event: event.name,
            distinct_id: event.distinctId,
            timestamp: event.timestamp,
            properties: { ...event.properties, $process_person_profile: false, $geoip_disable: true },
          })),
        }),
      });
      if (!response.ok) throw new Error('Telemetry delivery failed');
    },
  };
}
