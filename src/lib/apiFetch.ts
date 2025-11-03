import { getAuth } from 'firebase/auth';

// App Check is optional at runtime; attach if present, don't crash if absent
async function maybeAppCheck(): Promise<string|undefined> {
  try {
    const mod: any = await import('firebase/app-check');
    const { getToken } = mod;
    const t = await getToken(undefined as any, false);
    return t?.token;
  } catch { return undefined; }
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  // Attach ID token if signed in
  try {
    const auth = getAuth();
    if (auth.currentUser) {
      const id = await auth.currentUser.getIdToken(false);
      headers.set('Authorization', `Bearer ${id}`);
    }
  } catch {}
  // Attach App Check token if available (soft)
  try {
    const ac = await maybeAppCheck();
    if (ac) headers.set('X-Firebase-AppCheck', ac);
  } catch {}

  const url = path.startsWith('/api') ? path : `/api${path}`;
  const res = await fetch(url, { ...init, headers, credentials: 'include' });
  const ct = res.headers.get('Content-Type') || '';
  const body = ct.includes('application/json') ? await res.json().catch(() => ({})) : await res.text().catch(()=>'');
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : (body?.error || `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return body;
}
