type RandomArray = Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array;
export interface NativeCryptoDriver {
  randomUUID(): string;
  getRandomValues<T extends RandomArray>(array: T): T;
  digest(data: BufferSource): Promise<ArrayBuffer>;
}

/** Hermes adapter for the secure primitives used by UUIDs and Supabase S256 PKCE.
 * Preserve existing implementations. Never substitute Math.random or plain PKCE.
 * This intentionally supplies digest only, not a general SubtleCrypto emulation.
 */
export function installNativeCrypto(target: object, driver: NativeCryptoDriver): void {
  const host = target as { crypto?: Record<string, unknown> };
  const current = host.crypto ?? {};
  if (typeof current.randomUUID !== 'function') Object.defineProperty(current, 'randomUUID', { value: () => driver.randomUUID(), configurable: true });
  if (typeof current.getRandomValues !== 'function') Object.defineProperty(current, 'getRandomValues', { value: <T extends RandomArray>(array: T): T => driver.getRandomValues(array), configurable: true });
  const subtle = (current.subtle ?? {}) as Record<string, unknown>;
  if (typeof subtle.digest !== 'function') Object.defineProperty(subtle, 'digest', {
    value: (algorithm: string | { name: string }, data: BufferSource) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name.toUpperCase() !== 'SHA-256') return Promise.reject(new Error('This native digest adapter supports SHA-256 only.'));
      return driver.digest(data);
    }, configurable: true,
  });
  if (!current.subtle) Object.defineProperty(current, 'subtle', { value: subtle, configurable: true });
  if (!host.crypto) Object.defineProperty(host, 'crypto', { value: current, configurable: true });
}
