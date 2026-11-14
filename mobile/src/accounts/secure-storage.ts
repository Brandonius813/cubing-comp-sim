/** SecureStore can reject large values on some iOS versions. Commit a chunk set
 * by switching its small manifest last. Failed writes retain the prior session. */
export interface SecureKeyValue {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
interface Manifest { version: 1; generation: string; count: number }
const MAX_CHUNKS = 128;
const CHUNK_SIZE = 400; // <= 1600 UTF-8 bytes; split only between code points.
function manifest(value: string | null): Manifest | null {
  if (value === null) return null;
  const parsed = JSON.parse(value) as Manifest;
  if (parsed.version !== 1 || !/^[a-zA-Z0-9-]{1,80}$/.test(parsed.generation)
    || !Number.isSafeInteger(parsed.count) || parsed.count < 1 || parsed.count > MAX_CHUNKS) throw new Error('Invalid secure session. Sign in again.');
  return parsed;
}
function safeKey(key: string) {
  if (!/^[a-zA-Z0-9._-]{1,180}$/.test(key)) throw new Error('Invalid secure storage key.');
  return `ccs.${key}`;
}
export function removeProviderTokens(value: string): string {
  try {
    const session = JSON.parse(value);
    if (session && typeof session === 'object' && typeof session.access_token === 'string') {
      delete session.provider_token; delete session.provider_refresh_token;
      return JSON.stringify(session);
    }
  } catch { /* PKCE verifiers are strings. */ }
  return value;
}
export function createSecureStorage(store: SecureKeyValue, generationId: () => string) {
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task); tail = next.catch(() => undefined); return next;
  };
  async function cleanup(key: string, old: Manifest | null) {
    if (old) await Promise.all(Array.from({ length: old.count }, (_, i) => store.deleteItemAsync(`${key}.${old.generation}.${i}`).catch(() => undefined)));
  }
  return {
    getItem: (key: string) => serialize(async () => {
      const prefix = safeKey(key); const current = manifest(await store.getItemAsync(prefix));
      if (!current) return null;
      const parts = await Promise.all(Array.from({ length: current.count }, (_, i) => store.getItemAsync(`${prefix}.${current.generation}.${i}`)));
      if (parts.some(part => part === null)) throw new Error('Secure session is incomplete. Sign in again.');
      return parts.join('');
    }),
    setItem: (key: string, raw: string) => serialize(async () => {
      const prefix = safeKey(key); const value = removeProviderTokens(raw);
      const points = Array.from(value);
      const parts = Array.from({ length: Math.max(1, Math.ceil(points.length / CHUNK_SIZE)) }, (_, index) => points.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE).join(''));
      const count = parts.length;
      if (count > MAX_CHUNKS) throw new Error('Session exceeds protected storage capacity.');
      const next: Manifest = { version: 1, generation: generationId(), count };
      manifest(JSON.stringify(next));
      const old = manifest(await store.getItemAsync(prefix));
      if (old?.generation === next.generation) throw new Error('Session generation must be unique.');
      try {
        for (let i = 0; i < count; i++) await store.setItemAsync(`${prefix}.${next.generation}.${i}`, parts[i]);
        await store.setItemAsync(prefix, JSON.stringify(next));
      } catch (error) { await cleanup(prefix, next); throw error; }
      await cleanup(prefix, old);
    }),
    removeItem: (key: string) => serialize(async () => {
      const prefix = safeKey(key); const old = manifest(await store.getItemAsync(prefix));
      await store.deleteItemAsync(prefix); await cleanup(prefix, old);
    }),
  };
}
