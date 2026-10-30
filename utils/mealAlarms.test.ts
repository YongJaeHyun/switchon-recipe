import { afterEach, describe, expect, it } from 'vitest';
import { mealAlarmBody, mealAlarms } from './mealAlarms';
import { DEFAULT_MEAL_MINUTES } from './mealTimes';

const kst = (iso: string) => new Date(`${iso}+09:00`);
const base = { times: DEFAULT_MEAL_MINUTES, checkedToday: [] as number[] };
const kstIso = (date: Date) =>
  new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16);

describe('mealAlarmBody', () => {
  it('그날 할 일 문구로', () => {
    expect(mealAlarmBody('점심 프로틴쉐이크 마시기')).toBe('점심 프로틴쉐이크 마실 시간이에요');
    expect(mealAlarmBody('점심 저탄수식 먹기')).toBe('점심 저탄수식 먹을 시간이에요');
  });
});

describe('mealAlarms', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('1주차 1일 아침 전: 1주차 7일 × 4끼 (KST 시각)', () => {
    const alarms = mealAlarms({ ...base, startDate: '2026-10-30', now: kst('2026-10-30T07:00') });
    expect(alarms).toHaveLength(28);
    expect(alarms.slice(0, 4).map((alarm) => kstIso(alarm.date))).toEqual([
      '2026-10-30T08:00',
      '2026-10-30T12:30',
      '2026-10-30T16:00',
      '2026-10-30T18:30',
    ]);
    expect(alarms[0]).toMatchObject({ meal: 'breakfast', day: 1 });
    expect(alarms[1].body).toBe('점심 프로틴쉐이크 마실 시간이에요');
    expect(kstIso(alarms[27].date)).toBe('2026-11-05T18:30');
  });

  it('4일차부터 점심은 저탄수식 문구', () => {
    const alarms = mealAlarms({ ...base, startDate: '2026-10-30', now: kst('2026-10-30T07:00') });
    const day4Lunch = alarms.find((alarm) => alarm.day === 4 && alarm.meal === 'lunch');
    expect(day4Lunch?.body).toBe('점심 저탄수식 먹을 시간이에요');
    const day3Lunch = alarms.find((alarm) => alarm.day === 3 && alarm.meal === 'lunch');
    expect(day3Lunch?.body).toBe('점심 프로틴쉐이크 마실 시간이에요');
  });

  it('지난 시각은 건너뛴다 (정각이면 이미 지난 것)', () => {
    const at = (time: string) =>
      mealAlarms({ ...base, startDate: '2026-10-30', now: kst(`2026-10-30T${time}`) });
    expect(at('07:59')[0].meal).toBe('breakfast');
    expect(at('08:00')[0].meal).toBe('lunch');
    expect(at('18:30')).toHaveLength(24);
    expect(at('18:30')[0].day).toBe(2);
  });

  it('오늘 체크한 끼니는 오늘 것만 빠진다 (체크를 풀면 다시 들어간다)', () => {
    const input = { ...base, startDate: '2026-10-30', now: kst('2026-10-30T07:00') };
    const checked = mealAlarms({ ...input, checkedToday: [1] });
    expect(checked).toHaveLength(27);
    expect(checked.some((alarm) => alarm.day === 1 && alarm.meal === 'lunch')).toBe(false);
    expect(checked.some((alarm) => alarm.day === 2 && alarm.meal === 'lunch')).toBe(true);
    expect(mealAlarms({ ...input, checkedToday: [] })).toHaveLength(28);
  });

  it('1주차 밖에서는 없다', () => {
    // 8일째(2주차 1일)
    expect(mealAlarms({ ...base, startDate: '2026-10-23', now: kst('2026-10-30T07:00') })).toEqual(
      []
    );
    expect(mealAlarms({ ...base, startDate: null, now: kst('2026-10-30T07:00') })).toEqual([]);
    // 7일차는 그날 남은 것만
    const day7 = mealAlarms({ ...base, startDate: '2026-10-24', now: kst('2026-10-30T13:00') });
    expect(day7.map((alarm) => kstIso(alarm.date))).toEqual([
      '2026-10-30T16:00',
      '2026-10-30T18:30',
    ]);
  });

  it('시작 전이면 1주차 1일부터 (오늘 체크는 상관없다)', () => {
    const alarms = mealAlarms({
      ...base,
      startDate: '2026-10-31',
      now: kst('2026-10-30T20:00'),
      checkedToday: [0],
    });
    expect(alarms).toHaveLength(28);
    expect(kstIso(alarms[0].date)).toBe('2026-10-31T08:00');
  });

  it('바꾼 끼니 시각을 쓴다', () => {
    const alarms = mealAlarms({
      ...base,
      times: { ...DEFAULT_MEAL_MINUTES, lunch: 720 },
      startDate: '2026-10-30',
      now: kst('2026-10-30T07:00'),
    });
    expect(kstIso(alarms[1].date)).toBe('2026-10-30T12:00');
  });

  it('KST 자정 경계: 기기 시간대가 KST가 아니어도 KST 날짜로 오늘을 정한다', () => {
    process.env.TZ = 'America/Los_Angeles';
    // KST 10-31 00:30 = LA 10-30 08:30. KST로는 시작일(1일차)이다
    const now = kst('2026-10-31T00:30');
    const alarms = mealAlarms({ ...base, startDate: '2026-10-31', now, checkedToday: [0] });
    expect(alarms).toHaveLength(27);
    expect(kstIso(alarms[0].date)).toBe('2026-10-31T12:30');
    // 자정 직전(KST 10-30 23:59)이면 아직 시작 전 → 오늘 체크와 상관없이 28개
    const before = mealAlarms({
      ...base,
      startDate: '2026-10-31',
      now: kst('2026-10-30T23:59'),
      checkedToday: [0],
    });
    expect(before).toHaveLength(28);
    expect(kstIso(before[0].date)).toBe('2026-10-31T08:00');
  });
});
