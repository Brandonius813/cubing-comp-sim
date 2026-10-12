// UI-only dependencies. No Supabase SDK client is constructed, so the UI
// fixture cannot leave session initialization, locks or auto-refresh running.
// Real SDK callbacks are exercised separately by account-auth.fixture.ts.
import { AccountAuth } from '../../src/cloud/auth';
import { CloudSaves } from '../../src/cloud/api';
export * from '../../src/cloud/types';

export const auth = new AccountAuth({});
export const accountFixtureSdkConfigured = auth.configured;
export const cloud = new CloudSaves();
// Simulate an available account service for the dialog's controls. Individual
// methods are replaced by deterministic UI doubles in account.fixture.tsx.
Object.defineProperty(auth, 'configured', { value: true });
Object.defineProperty(cloud, 'configured', { value: true });
export const cloudConfigured = true;
