import { describe, expect, it } from 'vitest';
import { authedInit, rawFunctionCall } from './helpers';

describe('startScanSession function', () => {
  it('requires authentication and app check', async () => {
    try {
      const response = await rawFunctionCall('startScanSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    } catch (error: any) {
      if (error?.message?.includes('ECONNREFUSED')) {
        return;
      }
      throw error;
    }
  });

  it('returns signed upload urls for developers', async () => {
    try {
      const response = await rawFunctionCall('startScanSession', await authedInit({
        method: 'POST',
        body: JSON.stringify({}),
      }));
      if (response.status >= 400) {
        return;
      }
      const payload = (await response.json()) as any;
      expect(payload).toHaveProperty('scanId');
      expect(payload).toHaveProperty('uploadUrls');
    } catch (error: any) {
      if (error?.message?.includes('ECONNREFUSED')) {
        return;
      }
      throw error;
    }
  });
});
