import fetch, { Headers, type RequestInit } from 'node-fetch';

const DEFAULT_ORIGIN = 'http://127.0.0.1:5001/mybodyscan-f3daf/us-central1';

export const emulatorOrigin = process.env.FUNCTIONS_EMULATOR_ORIGIN ?? DEFAULT_ORIGIN;

export function functionUrl(path: string): string {
  return `${emulatorOrigin.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function callFunction<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const url = functionUrl(path);
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Function ${path} failed (${response.status}): ${text}`);
  }

  if (response.headers.get('content-type')?.includes('application/json')) {
    return (await response.json()) as T;
  }
  return undefined as T;
}

export async function rawFunctionCall(path: string, init?: RequestInit) {
  const url = functionUrl(path);
  return fetch(url, init);
}

export async function getDeveloperToken(): Promise<string> {
  if (process.env.TEST_ID_TOKEN) {
    return process.env.TEST_ID_TOKEN;
  }
  // Emulator accepts special token for authenticated requests
  return 'owner';
}

export async function authedInit(init?: RequestInit): Promise<RequestInit> {
  const token = await getDeveloperToken();
  const headers = new Headers(init?.headers ?? undefined);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Firebase-AppCheck', 'integration-test');
  return { ...init, headers };
}
