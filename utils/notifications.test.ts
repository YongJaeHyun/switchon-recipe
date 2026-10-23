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
  const kst = (iso: string) => new Date(`${iso}+09:00`);
  // 이번 주차 = 10-21(수) ~ 10-27(화)
  const week = { now: kst('2026-10-21T10:00:00'), weekFrom: '2026-10-21' };

  it('08:00 이후 시작이면 그날 07:00에 "오늘 HH:MM부터"', () => {
    expect(
      fastingAlarms(
        { days: [4, 6], start_time: '점심 식후', start_minutes: { '4': 780, '6': 1170 } },
        week
      )
    ).toEqual([
      { date: kst('2026-10-22T07:00:00'), body: `오늘 13:00부터 24시간 단식이 시작돼요.${tail}` },
      { date: kst('2026-10-24T07:00:00'), body: `오늘 19:30부터 24시간 단식이 시작돼요.${tail}` },
    ]);
  });

  it('08:00 전 시작이면 전날 21:00에 "내일 HH:MM부터" (월 06:00 → 일 21:00)', () => {
    expect(
      fastingAlarms({ days: [1], start_time: null, start_minutes: { '1': 360 } }, week)
    ).toEqual([
      { date: kst('2026-10-25T21:00:00'), body: `내일 06:00부터 24시간 단식이 시작돼요.${tail}` },
    ]);
  });

  it('경계: 07:30은 전날 저녁, 08:00은 그날 아침', () => {
    expect(
      fastingAlarms({ days: [4], start_time: null, start_minutes: { '4': 450 } }, week)
    ).toEqual([
      { date: kst('2026-10-21T21:00:00'), body: `내일 07:30부터 24시간 단식이 시작돼요.${tail}` },
    ]);
    expect(
      fastingAlarms({ days: [4], start_time: null, start_minutes: { '4': 480 } }, week)
    ).toEqual([
      { date: kst('2026-10-22T07:00:00'), body: `오늘 08:00부터 24시간 단식이 시작돼요.${tail}` },
    ]);
  });

  it('이미 지난 알림은 만들지 않는다', () => {
    const fasting = { days: [4, 6], start_time: '저녁 식후', start_minutes: null };
    expect(fastingAlarms(fasting, { ...week, now: kst('2026-10-22T07:00:00') })).toEqual([
      { date: kst('2026-10-24T07:00:00'), body: `오늘 19:00부터 24시간 단식이 시작돼요.${tail}` },
    ]);
    // 주차 첫날(월) 06:00 단식: 알림 시각(전날 일 21:00)이 이미 지났다
    expect(
      fastingAlarms(
        { days: [1], start_time: null, start_minutes: { '1': 360 } },
        { now: kst('2026-10-26T05:00:00'), weekFrom: '2026-10-26' }
      )
    ).toEqual([]);
  });

  it('옛 라벨만 있으면 그 시각을 모든 요일에', () => {
    expect(
      fastingAlarms({ days: [0], start_time: '저녁 식후', start_minutes: null }, week)
    ).toEqual([
      { date: kst('2026-10-25T07:00:00'), body: `오늘 19:00부터 24시간 단식이 시작돼요.${tail}` },
    ]);
  });

  it('시각이 없는 요일은 알림이 없다', () => {
    expect(fastingAlarms({ days: [1], start_time: null, start_minutes: null }, week)).toEqual([]);
    expect(fastingAlarms(null, week)).toEqual([]);
  });
});
