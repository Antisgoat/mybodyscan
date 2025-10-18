import { describe, expect, it } from 'vitest';
import { authedInit, callFunction, rawFunctionCall } from './helpers';

describe('nutritionBarcode function', () => {
  it('returns item or 404 for unknown code', async () => {
    try {
      const response = await rawFunctionCall('nutritionBarcode?code=000000000000', await authedInit());
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        const payload: any = await response.json();
        expect(payload).toBeTypeOf('object');
        expect(payload.item).toHaveProperty('name');
        expect(payload.item).toHaveProperty('source');
      } else {
        const payload: any = await response.json().catch(() => ({}));
        expect(payload?.message || payload?.error).toBeTruthy();
      }
    } catch (error: any) {
      if (error?.message?.includes('ECONNREFUSED')) {
        return;
      }
      throw error;
    }
  });
});
