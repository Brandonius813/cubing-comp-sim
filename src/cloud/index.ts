import { AccountAuth } from './auth';
import { CloudSaves } from './api';

export * from './types';
export { AccountAuth } from './auth';
export { CloudSaves } from './api';

export const auth = new AccountAuth({
  url: import.meta.env.VITE_SUPABASE_URL,
  publicKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  appUrl: import.meta.env.VITE_APP_URL,
});
export const cloud = new CloudSaves(import.meta.env.VITE_API_URL);
export const cloudConfigured = auth.configured && cloud.configured;
export const cloudConfigurationMessage = cloudConfigured ? null : 'Accounts and cloud saves are not configured yet. Your times are saved on this device.';
