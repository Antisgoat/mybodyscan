import { getAuth } from "firebase/auth";
import { getAppCheckHeader } from "@/lib/firebase";

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
  const url = path.startsWith('/api') ? path : `/api${path}`;
  if (url.startsWith('/api')) {
    const appCheckHeader = await getAppCheckHeader();
    for (const [key, value] of Object.entries(appCheckHeader)) {
      if (value) {
        headers.set(key, value);
      }
    }
  }
  const res = await fetch(url, { ...init, headers, credentials: 'include' });
  const ct = res.headers.get('Content-Type') || '';
  const body = ct.includes('application/json') ? await res.json().catch(() => ({})) : await res.text().catch(()=>'');
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : body?.error || `HTTP ${res.status}`;
    const error = new Error(msg);
    if (body && typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string') {
      (error as Error & { code?: string }).code = body.code;
    }
    throw error;
  }
  return body;
}
