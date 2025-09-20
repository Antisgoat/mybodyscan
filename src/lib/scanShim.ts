import { isDemoGuest } from './demoFlag';
import { auth } from './firebase';

const TODO_LINK = 'https://linear.app/mybodyscan/issue/SCAN-SHIM';

function logShim(method: string) {
  console.info(`[shim] ${method}() – replace with production scan API. TODO: ${TODO_LINK}`);
}

export interface MockScanRequest {
  scanId: string;
  status: 'processing' | 'ready';
  submittedAt: string;
  storagePath: string;
}

export interface MockScanSummary {
  id: string;
  createdAt: string;
  status: 'processing' | 'ready';
  measurements?: {
    weight: number;
    bodyFat: number;
    muscleMass: number;
  };
}

export async function requestScanMock(photoCount = 4): Promise<MockScanRequest> {
  logShim('requestScanMock');
  const uid = auth.currentUser?.uid ?? 'demo-user';
  const scanId = `demo-${Date.now()}`;
  const basePath = isDemoGuest() ? `users/${uid}/demo/scans` : `users/${uid}/scans`;

  return {
    scanId,
    status: 'processing',
    submittedAt: new Date().toISOString(),
    storagePath: `${basePath}/${scanId}/photos:${photoCount}`,
  };
}

export async function listScansMock(): Promise<MockScanSummary[]> {
  logShim('listScansMock');
  const now = new Date();
  return [0, 1, 2].map((offset) => ({
    id: `demo-scan-${offset}`,
    createdAt: new Date(now.getTime() - offset * 86400000).toISOString(),
    status: offset === 0 ? 'processing' : 'ready',
    measurements: offset === 0
      ? undefined
      : {
          weight: Number((82 - offset).toFixed(1)),
          bodyFat: Number((18.4 - offset * 0.3).toFixed(1)),
          muscleMass: Number((35 + offset * 0.5).toFixed(1)),
        },
  }));
}

export async function latestScanMock(): Promise<MockScanSummary | undefined> {
  logShim('latestScanMock');
  const scans = await listScansMock();
  return scans[0];
}
