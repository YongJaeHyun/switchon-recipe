import { describe, expect, it, vi } from 'vitest';

const online = { value: true };
vi.mock('./network', () => ({ isOnline: async () => online.value }));

const { OfflineError, failFastWhenOffline } = await import('./failFastWhenOffline');

describe('failFastWhenOffline', () => {
  it('calls the fetcher when online', async () => {
    online.value = true;
    const fetcher = vi.fn(async () => 'data');
    expect(await failFastWhenOffline(fetcher)()).toBe('data');
  });

  it('throws OfflineError without calling the fetcher when offline', async () => {
    online.value = false;
    const fetcher = vi.fn(async () => 'data');
    await expect(failFastWhenOffline(fetcher)()).rejects.toBeInstanceOf(OfflineError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
