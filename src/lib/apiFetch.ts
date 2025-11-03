import { app } from './firebase';
import { getAuth } from 'firebase/auth';

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  // JSON by default unless a FormData body is provided
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach Firebase ID token if signed in
  try {
    const auth = getAuth(app);
    if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken(false);
      headers.set('Authorization', `Bearer ${idToken}`);
    }
  } catch { /* no-op */ }

  // Try to add App Check token if runtime has it (do not crash if not configured yet)
  try {
    const mod: any = await import('firebase/app-check');
    const { getToken } = mod;
    // passing undefined uses default app-check instance when initialized; catch otherwise
    const t = await getToken(undefined as any, false);
    if (t?.token) headers.set('X-Firebase-AppCheck', t.token);
  } catch { /* soft */ }

  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  const ct = res.headers.get('Content-Type') || '';
  const body = ct.includes('application/json') ? await res.json().catch(() => ({})) : await res.text().catch(()=>'');
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : (body?.error || body?.message || `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return body;
}
