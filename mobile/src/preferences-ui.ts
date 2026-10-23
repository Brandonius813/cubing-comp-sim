import { useRef, useState } from 'react';
import { validateMobilePreferences, type MobilePreferences } from './practice';

/** Serialize writes and retain failed patches so quick control changes are not lost. */
export function usePreferencePatch(preferences: MobilePreferences, onChange: (next: MobilePreferences) => Promise<boolean>) {
  const latest = useRef(preferences); latest.current = preferences;
  const pending = useRef<Partial<MobilePreferences>>({});
  const writing = useRef(false);
  const [error, setError] = useState('');
  const drain = async () => {
    if (writing.current) return;
    writing.current = true;
    let attempted: Partial<MobilePreferences> = {};
    try {
      while (Object.keys(pending.current).length) {
        const patch = pending.current; attempted = patch; pending.current = {};
        const next = validateMobilePreferences({ ...latest.current, ...patch });
        if (!await onChange(next)) { pending.current = { ...patch, ...pending.current }; setError('Could not save settings.'); return; }
        latest.current = next; attempted = {}; setError('');
      }
    } catch (cause) { pending.current = { ...attempted, ...pending.current }; setError(cause instanceof Error ? cause.message : 'Could not save settings.'); }
    finally { writing.current = false; }
  };
  return { error, retry: () => { void drain(); }, update: (patch: Partial<MobilePreferences>) => {
    try { validateMobilePreferences({ ...latest.current, ...pending.current, ...patch }); pending.current = { ...pending.current, ...patch }; void drain(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid settings.'); }
  } };
}
