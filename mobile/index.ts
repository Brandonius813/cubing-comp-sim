import { registerRootComponent } from 'expo';
import { randomUUID } from 'expo-crypto';
import App from './App';

// The portable round model uses UUIDs. Hermes does not always supply Web Crypto.
if (!globalThis.crypto?.randomUUID) {
  const current = globalThis.crypto ?? {};
  Object.defineProperty(globalThis, 'crypto', { value: Object.assign(current, { randomUUID }), configurable: true });
}
registerRootComponent(App);
