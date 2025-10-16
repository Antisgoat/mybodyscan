import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('safeEmailSignIn retry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('retries once on auth/network-request-failed', async () => {
    vi.useFakeTimers();

    const signInMock = vi.fn()
      .mockRejectedValueOnce({ code: 'auth/network-request-failed' })
      .mockResolvedValueOnce({ user: { uid: 'u1' } });

    vi.doMock('firebase/app', async () => ({ getApps: () => [], getApp: vi.fn(), initializeApp: vi.fn(() => ({})) } as any));
    vi.doMock('firebase/app-check', async () => ({ initializeAppCheck: vi.fn(() => ({})), ReCaptchaV3Provider: vi.fn() } as any));
    vi.doMock('firebase/auth', async () => ({
      getAuth: vi.fn(() => ({ currentUser: null })),
      initializeAuth: vi.fn(() => ({ currentUser: null })),
      browserLocalPersistence: {} as any,
      setPersistence: vi.fn(() => Promise.resolve()),
      signInWithEmailAndPassword: signInMock,
    } as any));
    vi.doMock('firebase/firestore', async () => ({ getFirestore: vi.fn(() => ({})) } as any));
    vi.doMock('firebase/functions', async () => ({ getFunctions: vi.fn(() => ({})) } as any));
    vi.doMock('firebase/storage', async () => ({ getStorage: vi.fn(() => ({})) } as any));
    vi.doMock('@/lib/env', async () => ({ FUNCTIONS_BASE: '', getViteString: (_: string, d?: string) => d ?? '' }));

    const { safeEmailSignIn } = await import('../../lib/firebase');
    const promise = safeEmailSignIn('a@example.com', 'pw');
    await vi.advanceTimersByTimeAsync(1000);
    const res = await promise;
    expect(res).toBeTruthy();
    expect(signInMock).toHaveBeenCalledTimes(2);
  });
});
