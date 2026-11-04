export function startAutoUpdates({canReload, beforeReload, onPending}) {
  const currentVersion = document.querySelector('meta[name="app-version"]')?.content;
  if (!/^[a-f0-9]{20}$/.test(currentVersion || '')) return;
  let registration, pendingVersion, checking = false, reloading = false, announced = false;
  const available = () => document.visibilityState === 'visible' && navigator.onLine;

  function applyPending() {
    if (!pendingVersion || reloading || !available()) return;
    if (!canReload() || document.activeElement?.matches('input,select,textarea,[contenteditable="true"]')) {
      if (!announced) { announced = true; onPending(); }
      return;
    }
    reloading = true;
    try { beforeReload(); } catch {}
    window.location.reload();
  }

  async function check() {
    if (checking || reloading || !available()) return;
    checking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/version.json', {cache: 'no-store', signal: controller.signal});
      if (!response.ok) return;
      const {version} = await response.json();
      if (!/^[a-f0-9]{20}$/.test(version || '')) return;
      pendingVersion = version === currentVersion ? null : version;
      if (pendingVersion && registration) await registration.update().catch(() => {});
      applyPending();
    } catch {
      // Offline or an incomplete deployment: keep the current app and retry later.
    } finally { clearTimeout(timeout); checking = false; }
  }

  const resume = () => { applyPending(); check(); };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('online', resume);
  document.addEventListener('close', applyPending, true);
  document.addEventListener('focusout', () => setTimeout(applyPending, 0));
  setInterval(check, 60000);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', check);
    navigator.serviceWorker.register('/sw.js', {updateViaCache: 'none'}).then(value => {
      registration = value;
      check();
    }).catch(() => {});
  }
  check();
}
