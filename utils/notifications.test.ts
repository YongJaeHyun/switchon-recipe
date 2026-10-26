import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  permission: 'granted' as string,
  requestResult: 'granted' as string,
  pushToken: 'saved-token' as string | null,
};
const getPermissionsAsync = vi.fn(async () => ({ status: state.permission }));
const requestPermissionsAsync = vi.fn(async () => ({ status: state.requestResult }));
const setNotificationChannelAsync = vi.fn(async (..._args: unknown[]) => null);
const getExpoPushTokenAsync = vi.fn(async (..._args: unknown[]) => ({ data: 'token' }));
const scheduled: {
  identifier: string;
  content: { title: string; data: Record<string, unknown> };
}[] = [];
const getAllScheduledNotificationsAsync = vi.fn(async () => [...scheduled]);
const cancelScheduledNotificationAsync = vi.fn(async (id: string) => {
  const index = scheduled.findIndex((request) => request.identifier === id);
  if (index >= 0) scheduled.splice(index, 1);
});
const scheduleNotificationAsync = vi.fn(
  async (request: { content: { title: string; data: Record<string, unknown> } }) => {
    const identifier = `id-${scheduled.length}-${Math.random()}`;
    scheduled.push({ identifier, content: request.content });
    return identifier;
  }
);

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: () => getPermissionsAsync(),
  requestPermissionsAsync: () => requestPermissionsAsync(),
  setNotificationChannelAsync: (...args: unknown[]) => setNotificationChannelAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => getExpoPushTokenAsync(...args),
  getAllScheduledNotificationsAsync: () => getAllScheduledNotificationsAsync(),
  cancelScheduledNotificationAsync: (id: string) => cancelScheduledNotificationAsync(id),
  scheduleNotificationAsync: (request: {
    content: { title: string; data: Record<string, unknown> };
  }) => scheduleNotificationAsync(request),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { MAX: 5 },
}));
vi.mock('expo-device', () => ({ isDevice: true }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { eas: { projectId: 'p' } } } },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('api/UserAPI', () => ({ UserAPI: { updatePushToken: async () => {} } }));
vi.mock('stores/userStore', () => ({
  useUserStore: { getState: () => ({ push_token: state.pushToken }) },
}));
vi.mock('./sendError', () => ({ captureError: () => {} }));

const { fastingAlarms, isFastingAlarm, registerChannelIfPermitted, registerWeeklyFastingAlarms } =
  await import('./notifications');

describe('registerWeeklyFastingAlarms (최종 리뷰 M1: 다시 걸 수 없으면 지우지 않는다)', () => {
  const old = {
    identifier: 'old',
    content: { title: '단식 시작 예정 알림', data: { kind: 'fasting' } },
  };
  // 먼 미래 주차라 알림이 지난 것으로 빠지지 않는다
  const fasting = { days: [4], start_time: '저녁 식후', start_minutes: { '4': 1140 } } as never;
  const weekFrom = '2099-01-01';

  beforeEach(() => {
    vi.clearAllMocks();
    scheduled.splice(0, scheduled.length, { ...old });
    state.permission = 'granted';
    state.requestResult = 'granted';
    state.pushToken = 'saved-token';
  });

  it('푸시 토큰을 못 받아도 로컬 알림은 다시 건다', async () => {
    state.pushToken = null;
    getExpoPushTokenAsync.mockRejectedValue(new Error('offline'));
    const ids = await registerWeeklyFastingAlarms(fasting, weekFrom);
    expect(ids).toHaveLength(1);
    expect(scheduled.map((request) => request.identifier)).toEqual(ids);
    getExpoPushTokenAsync.mockReset();
  });

  it('알림 권한이 없으면 있던 알림을 지우지 않는다', async () => {
    state.permission = 'denied';
    state.requestResult = 'denied';
    expect(await registerWeeklyFastingAlarms(fasting, weekFrom)).toEqual([]);
    expect(cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(scheduled).toEqual([old]);
  });

  it('단식 요일이 없으면 지운다', async () => {
    expect(await registerWeeklyFastingAlarms(null, weekFrom)).toEqual([]);
    expect(scheduled).toEqual([]);
  });
});

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

describe('isFastingAlarm', () => {
  const request = (content: { title?: string | null; data?: Record<string, unknown> | null }) => ({
    identifier: 'x',
    content,
  });

  it('이번 앱이 건 단식 알림(data.kind)과 옛 앱의 반복 단식 알림(제목)', () => {
    expect(
      isFastingAlarm(request({ title: '단식 시작 예정 알림', data: { kind: 'fasting' } }))
    ).toBe(true);
    expect(isFastingAlarm(request({ title: '단식 시작 예정 알림', data: {} }))).toBe(true);
  });

  it('다른 알림은 아니다', () => {
    expect(isFastingAlarm(request({ title: '체중 기록', data: { href: '/weight' } }))).toBe(false);
    expect(isFastingAlarm(request({ title: null, data: null }))).toBe(false);
  });
});
