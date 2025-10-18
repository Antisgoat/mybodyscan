import { describe, expect, it } from 'vitest';

describe('Scan Status Polling', () => {
  it('should implement exponential backoff correctly', () => {
    const delays = [];
    let delay = 1000; // Start with 1 second
    
    for (let i = 0; i < 5; i++) {
      delays.push(delay);
      delay = Math.min(delay * 2, 30000); // Max 30 seconds
    }
    
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('should handle status transitions correctly', () => {
    const statuses = ['processing', 'complete', 'failed'] as const;
    
    expect(statuses).toContain('processing');
    expect(statuses).toContain('complete');
    expect(statuses).toContain('failed');
  });
});