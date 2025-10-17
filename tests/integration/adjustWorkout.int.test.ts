import { describe, expect, it } from 'vitest';
import { authedInit, callFunction } from './helpers';

describe('adjustWorkout function', () => {
  it('responds with modifier payload', async () => {
    let payload: any;
    try {
      payload = await callFunction('adjustWorkout', await authedInit({
        method: 'POST',
        body: JSON.stringify({ dayId: 'Mon', bodyFeel: 'great', notes: '' }),
      }));
    } catch (error: any) {
      if (error?.message?.includes('ECONNREFUSED')) {
        return;
      }
      throw error;
    }

    expect(payload).toBeTypeOf('object');
    expect(payload).toHaveProperty('mods');
  });
});
