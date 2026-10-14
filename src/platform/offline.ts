export type OfflineStatus = 'unavailable' | 'downloading' | 'ready' | 'update-ready';

export function registerOfflineSupport(onStatus: (status: OfflineStatus) => void): () => void {
  let disposed = false;
  const report = (status: OfflineStatus) => { if (!disposed) onStatus(status); };
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    report('unavailable');
    return () => { disposed = true; };
  }
  report('downloading');
  let registration: ServiceWorkerRegistration | undefined;
  const check = () => {
    if (!disposed && navigator.onLine && document.visibilityState === 'visible') void registration?.update().catch(() => undefined);
  };
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', check);
  const interval = window.setInterval(check, 5 * 60 * 1000);
  void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(async value => {
    registration = value;
    registration.addEventListener('updatefound', () => {
      const worker = value.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') report(navigator.serviceWorker.controller ? 'update-ready' : 'ready');
        if (worker.state === 'redundant') report('unavailable');
      });
    });
    await navigator.serviceWorker.ready;
    report(registration.waiting ? 'update-ready' : 'ready');
    check();
  }).catch(() => report('unavailable'));
  return () => {
    disposed = true;
    window.clearInterval(interval);
    window.removeEventListener('online', check);
    document.removeEventListener('visibilitychange', check);
  };
}

export async function applyOfflineUpdate(): Promise<'applied' | 'other-tabs' | 'unavailable'> {
  if (!navigator.onLine || !('serviceWorker' in navigator)) return 'unavailable';
  const registration = await navigator.serviceWorker.getRegistration();
  const worker = registration?.waiting;
  if (!worker) return 'unavailable';
  return new Promise(resolve => {
    const channel = new MessageChannel();
    let accepted = false;
    let finished = false;
    const done = (result: 'applied' | 'other-tabs' | 'unavailable') => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      channel.port1.close();
      resolve(result);
    };
    const changed = () => { if (accepted && navigator.serviceWorker.controller === worker) done('applied'); };
    const timeout = window.setTimeout(() => done('unavailable'), 15000);
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    channel.port1.onmessage = event => {
      if (event.data === 'other-tabs') done('other-tabs');
      if (event.data === 'accepted') { accepted = true; changed(); }
    };
    try { worker.postMessage('APPLY_UPDATE', [channel.port2]); }
    catch { done('unavailable'); }
  });
}
