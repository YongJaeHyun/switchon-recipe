import { beforeEach, describe, expect, it, vi } from 'vitest';

const netState = {
  isConnected: true as boolean | null,
  isInternetReachable: true as boolean | null,
};
const showErrorToast = vi.fn();

vi.mock('@react-native-community/netinfo', () => ({
  default: { fetch: async () => ({ ...netState }) },
}));
vi.mock('./showToast', () => ({ showErrorToast: (...args: unknown[]) => showErrorToast(...args) }));

const { isOnline, requireOnline, showNetworkErrorToast } = await import('./network');

describe('isOnline', () => {
  it('is true when connected and reachable', async () => {
    Object.assign(netState, { isConnected: true, isInternetReachable: true });
    expect(await isOnline()).toBe(true);
  });

  it('is true when reachability is still unknown', async () => {
    Object.assign(netState, { isConnected: true, isInternetReachable: null });
    expect(await isOnline()).toBe(true);
  });

  it('is false when disconnected or unreachable', async () => {
    Object.assign(netState, { isConnected: false, isInternetReachable: null });
    expect(await isOnline()).toBe(false);
    Object.assign(netState, { isConnected: true, isInternetReachable: false });
    expect(await isOnline()).toBe(false);
  });
});

describe('requireOnline', () => {
  beforeEach(() => {
    showErrorToast.mockClear();
    vi.useFakeTimers();
    vi.advanceTimersByTime(60000);
    vi.useRealTimers();
  });

  it('runs the action when online', async () => {
    Object.assign(netState, { isConnected: true, isInternetReachable: true });
    const action = vi.fn(async () => 'done');

    expect(await requireOnline(action)()).toBe('done');
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it('shows a network toast instead of running the action when offline', async () => {
    Object.assign(netState, { isConnected: false, isInternetReachable: false });
    const action = vi.fn();

    expect(await requireOnline(action)()).toBeUndefined();
    expect(action).not.toHaveBeenCalled();
    expect(showErrorToast).toHaveBeenCalledWith({ textType: 'NETWORK_ERROR' });
  });
});

describe('showNetworkErrorToast', () => {
  it('shows at most one toast within 3 seconds', () => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(10000);
    showErrorToast.mockClear();

    showNetworkErrorToast();
    showNetworkErrorToast();
    expect(showErrorToast).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3001);
    showNetworkErrorToast();
    expect(showErrorToast).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
