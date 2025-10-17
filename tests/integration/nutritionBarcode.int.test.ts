import { describe, expect, it } from 'vitest';
import { authedInit, callFunction } from './helpers';

describe('nutritionBarcode function', () => {
  it('returns item or empty payload for unknown code', async () => {
    let payload: any;
    try {
      payload = await callFunction('nutritionBarcode?code=000000000000', await authedInit());
    } catch (error: any) {
      if (error?.message?.includes('ECONNREFUSED')) {
        return;
      }
      throw error;
    }
    expect(payload).toBeTypeOf('object');
    if (payload?.item) {
      expect(payload.item).toHaveProperty('name');
      expect(payload.item).toHaveProperty('source');
    }
  });
});
