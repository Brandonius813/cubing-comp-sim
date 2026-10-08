export type OfflineStatus = 'unavailable' | 'downloading' | 'ready' | 'update-ready';

export function registerOfflineSupport(onStatus: (status: OfflineStatus) => void): () => void {
  let disposed = false;
  const report = (status: OfflineStatus) => { if (!disposed) onStatus(status); };
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    report('unavailable');
    return () => { disposed = true; };
  }
  report('downloading');
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async registration => {
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') report(navigator.serviceWorker.controller ? 'update-ready' : 'ready');
        if (worker.state === 'redundant') report('unavailable');
      });
    });
    await navigator.serviceWorker.ready;
    report(registration.waiting ? 'update-ready' : 'ready');
  }).catch(() => report('unavailable'));
  return () => { disposed = true; };
}
