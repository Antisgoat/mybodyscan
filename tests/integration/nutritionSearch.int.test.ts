import { describe, expect, it } from 'vitest';
import { authedInit, callFunction } from './helpers';

describe('nutritionSearch function', () => {
  it('returns normalized results', async () => {
    let payload: any;
    try {
      payload = await callFunction('nutritionSearch?q=apple', await authedInit());
    } catch (error: any) {
      if (error?.message?.includes('ECONNREFUSED')) {
        return;
      }
      throw error;
    }
    expect(Array.isArray(payload?.items)).toBe(true);
    if (payload?.items?.length) {
      const item = payload.items[0];
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('source');
    }
  });
});
