import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('firebase init order', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initializes AppCheck before constructing Auth', async () => {
    const callOrder: string[] = [];

    vi.doMock('firebase/app', async () => ({
      initializeApp: vi.fn(() => { callOrder.push('initializeApp'); return {}; }),
      getApp: vi.fn(() => ({})),
      getApps: vi.fn(() => []),
    } as any));

    vi.doMock('firebase/app-check', async () => ({
      initializeAppCheck: vi.fn(() => { callOrder.push('initializeAppCheck'); return {}; }),
      ReCaptchaV3Provider: vi.fn(),
    } as any));

    vi.doMock('firebase/auth', async () => ({
      getAuth: vi.fn(() => { callOrder.push('getAuth'); return {}; }),
      initializeAuth: vi.fn(() => { callOrder.push('initializeAuth'); return {}; }),
      browserLocalPersistence: {} as any,
      setPersistence: vi.fn(() => Promise.resolve()),
      signInWithEmailAndPassword: vi.fn(() => Promise.resolve({ ok: true })),
    } as any));

    vi.doMock('firebase/firestore', async () => ({ getFirestore: vi.fn(() => ({})) } as any));
    vi.doMock('firebase/functions', async () => ({ getFunctions: vi.fn(() => ({})) } as any));
    vi.doMock('firebase/storage', async () => ({ getStorage: vi.fn(() => ({})) } as any));

    vi.doMock('@/lib/env', async () => ({ FUNCTIONS_BASE: '', getViteString: (_: string, d?: string) => d ?? '' }));

    const mod = await import('../../lib/firebase');
    expect(mod.app).toBeTruthy();

    const appCheckIndex = callOrder.indexOf('initializeAppCheck');
    const authIndex = Math.min(
      callOrder.indexOf('getAuth') === -1 ? Infinity : callOrder.indexOf('getAuth'),
      callOrder.indexOf('initializeAuth') === -1 ? Infinity : callOrder.indexOf('initializeAuth')
    );
    expect(appCheckIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBeGreaterThan(appCheckIndex);
  });
});
