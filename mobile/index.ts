import { registerRootComponent } from 'expo';
import { randomUUID, getRandomValues, digest, CryptoDigestAlgorithm } from 'expo-crypto';
import { installNativeCrypto } from './src/native-crypto';
import App from './App';

// Hermes does not always expose Web Crypto. Use native secure primitives before
// creating accounts or round IDs; provider authentication also verifies S256.
installNativeCrypto(globalThis, { randomUUID, getRandomValues, digest: data => digest(CryptoDigestAlgorithm.SHA256, data) });
registerRootComponent(App);
