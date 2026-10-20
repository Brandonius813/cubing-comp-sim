import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { randomUUID } from 'expo-crypto';
import { CloudSaves } from '../../../src/cloud/api';
import { NativeAccounts } from './auth';
import { createSecureStorage } from './secure-storage';
import { ExplicitTransfers } from './transfers';

/** Values are build configuration, never service-role keys or Apple secrets. */
export function createNativeAccountServices() {
  const secure = createSecureStorage({
    getItemAsync: key => SecureStore.getItemAsync(key),
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    deleteItemAsync: key => SecureStore.deleteItemAsync(key),
  }, randomUUID);
  const auth = new NativeAccounts({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publicKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    providers: process.env.EXPO_PUBLIC_AUTH_PROVIDERS,
    webUrl: process.env.EXPO_PUBLIC_WEB_URL,
  }, secure, randomUUID, (url, redirect) => WebBrowser.openAuthSessionAsync(url, redirect));
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  let validApiUrl: string | undefined;
  try {
    const parsed = new URL(apiUrl ?? '');
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash && !parsed.search && parsed.pathname === '/') validApiUrl = parsed.origin;
  } catch { /* Missing/invalid configuration never falls back to production. */ }
  const cloud = new CloudSaves(validApiUrl);
  const transfers = new ExplicitTransfers(cloud, () => auth.verifiedSession(), randomUUID);
  return { auth, cloud, transfers };
}
export type NativeAccountServices = ReturnType<typeof createNativeAccountServices>;
