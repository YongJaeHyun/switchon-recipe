import { describe, expect, it } from 'vitest';
import { withTimeout } from './withTimeout';

describe('withTimeout', () => {
  it('resolves with the value when it finishes in time', async () => {
    expect(await withTimeout(Promise.resolve(1), 50)).toBe(1);
  });

  it('rejects when it takes too long', async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow('timeout');
  });
});
