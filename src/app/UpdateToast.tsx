import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Shows "Update available" when a new version has been deployed. Never reloads on its own,
 * so an update can't interrupt a playtest.
 */
export function UpdateToast() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version whenever the app comes back to the foreground.
      if (!registration) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update();
      });
    },
  });

  if (needRefresh) {
    return (
      <div className="toast" role="status">
        <span>Update available</span>
        <button className="btn btn-small btn-primary" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
        <button className="btn btn-small" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div className="toast" role="status">
        <span>Ready to work offline</span>
        <button className="btn btn-small" onClick={() => setOfflineReady(false)}>
          OK
        </button>
      </div>
    );
  }

  return null;
}
