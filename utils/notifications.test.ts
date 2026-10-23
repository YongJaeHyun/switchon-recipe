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

const { fastingAlarms, registerChannelIfPermitted } = await import('./notifications');

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

describe('fastingAlarms', () => {
  const tail = '\n단식 후, 첫 끼는 든든하게 챙겨드세요!';

  it('요일마다 그 요일 시작 시각으로 문구를 만든다 (weekday 1=일)', () => {
    expect(
      fastingAlarms({
        days: [4, 6],
        start_time: '점심 식후',
        start_minutes: { '4': 780, '6': 1170 },
      })
    ).toEqual([
      { weekday: 5, body: `오늘 13:00부터 24시간 단식이 시작돼요.${tail}` },
      { weekday: 7, body: `오늘 19:30부터 24시간 단식이 시작돼요.${tail}` },
    ]);
  });

  it('옛 라벨만 있으면 그 시각을 모든 요일에', () => {
    expect(fastingAlarms({ days: [0], start_time: '저녁 식후', start_minutes: null })).toEqual([
      { weekday: 1, body: `오늘 19:00부터 24시간 단식이 시작돼요.${tail}` },
    ]);
  });

  it('시각이 없는 요일은 알림이 없다', () => {
    expect(fastingAlarms({ days: [1], start_time: null, start_minutes: null })).toEqual([]);
    expect(fastingAlarms(null)).toEqual([]);
  });
});
