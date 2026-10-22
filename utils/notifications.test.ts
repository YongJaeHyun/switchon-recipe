import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { permission: 'granted' as string };
const getPermissionsAsync = vi.fn(async () => ({ status: state.permission }));
const requestPermissionsAsync = vi.fn(async () => ({ status: 'granted' }));
const setNotificationChannelAsync = vi.fn(async (..._args: unknown[]) => null);

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: () => getPermissionsAsync(),
  requestPermissionsAsync: () => requestPermissionsAsync(),
  setNotificationChannelAsync: (...args: unknown[]) => setNotificationChannelAsync(...args),
  getExpoPushTokenAsync: async () => ({ data: 'token' }),
  AndroidImportance: { MAX: 5 },
}));
vi.mock('expo-device', () => ({ isDevice: true }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { eas: { projectId: 'p' } } } },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('api/UserAPI', () => ({ UserAPI: { updatePushToken: async () => {} } }));
vi.mock('stores/userStore', () => ({
  useUserStore: { getState: () => ({ push_token: 'saved-token' }) },
}));
vi.mock('./sendError', () => ({ captureError: () => {} }));

const { registerChannelIfPermitted } = await import('./notifications');

describe('registerChannelIfPermitted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('권한이 이미 있으면 채널을 등록한다', async () => {
    state.permission = 'granted';
    expect(await registerChannelIfPermitted('REPORT')).toBe(true);
    expect(setNotificationChannelAsync).toHaveBeenCalledWith('REPORT', expect.anything());
  });

  it('권한이 없으면 요청 창을 띄우지 않고 등록하지 않는다', async () => {
    state.permission = 'undetermined';
    expect(await registerChannelIfPermitted('REPORT')).toBe(false);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('권한 확인이 실패해도 throw하지 않는다', async () => {
    getPermissionsAsync.mockRejectedValueOnce(new Error('x'));
    expect(await registerChannelIfPermitted('REPORT')).toBe(false);
  });
});
