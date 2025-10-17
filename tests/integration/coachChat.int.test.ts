import { describe, expect, it } from 'vitest';
import { authedInit, callFunction } from './helpers';

describe('coachChat function', () => {
  it('returns assistant message', async () => {
    let payload: any;
    try {
      payload = await callFunction('coachChat', await authedInit({
        method: 'POST',
        body: JSON.stringify({ message: 'Integration test hello' }),
      }));
    } catch (error: any) {
      if (error?.message?.includes('ECONNREFUSED')) {
        return;
      }
      throw error;
    }
    expect(payload).toBeTypeOf('object');
    expect(payload).toHaveProperty('reply');
  });
});
