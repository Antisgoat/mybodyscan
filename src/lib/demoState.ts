export const DEMO_KEYS = ['mbs.demo','mbs:demo','mbs_demo','demo']; // legacy keys

export function isDemoLocal(): boolean {
  try { return localStorage.getItem('mbs.demo') === '1'; } catch { return false; }
}
export function enableDemoLocal() { try { localStorage.setItem('mbs.demo','1'); } catch {} }
export function disableDemoEverywhere() {
  try {
    for (const k of DEMO_KEYS) { localStorage.removeItem(k); sessionStorage.removeItem(k); }
  } catch {}
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('demo')) { url.searchParams.delete('demo'); history.replaceState({}, '', url.toString()); }
  } catch {}
  try { window.dispatchEvent(new StorageEvent('storage', { key: 'mbs.demo', newValue: null } as any)); } catch {}
}
export function isDemoEffective(authed: boolean): boolean {
  // DEMO IS NEVER ACTIVE FOR AN AUTHENTICATED USER
  return authed ? false : isDemoLocal();
}
