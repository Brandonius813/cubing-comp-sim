import { CloudError } from './types';

/** Send the one-use native code or browser refresh token directly to our API.
 * Never persist either credential in the browser/device session adapter. */
export async function captureAppleGrant(apiUrl: string | undefined, accessToken: string,
  grant: { clientId: string; code?: string; refreshToken?: string }): Promise<void> {
  let origin: URL;
  try {
    origin = new URL(apiUrl ?? '');
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error();
  } catch { throw new CloudError('not_configured', 'Apple account support is not configured in this build.'); }
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    response = await fetch(new URL('/v1/account/apple-grant', origin), {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(grant), signal: controller.signal,
    });
  } catch { throw new CloudError('network_error', 'Could not finish Apple account setup. Please try signing in again.'); }
  finally { clearTimeout(timer); }
  if (!response.ok) throw new CloudError('auth_error', 'Could not finish Apple account setup. Please try signing in again.');
}
