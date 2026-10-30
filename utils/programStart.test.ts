import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWeekAndDay } from './date';
import {
  addDaysToDay,
  BEFORE_START_DAY,
  daysUntilStart,
  isBeforeStart,
  programWeekAndDay,
  startCountdownLabel,
  todayRevalidation,
} from './programStart';

describe('daysUntilStart', () => {
  it('오늘 시작이면 0', () => {
    expect(daysUntilStart('2026-10-30', '2026-10-30')).toBe(0);
  });

  it('내일 시작이면 1, 사흘 뒤면 3', () => {
    expect(daysUntilStart('2026-10-31', '2026-10-30')).toBe(1);
    expect(daysUntilStart('2026-11-02', '2026-10-30')).toBe(3);
  });

  it('이미 시작했으면 음수 (지난 날 수)', () => {
    expect(daysUntilStart('2026-10-25', '2026-10-30')).toBe(-5);
  });

  it('달·해가 바뀌는 경계', () => {
    expect(daysUntilStart('2026-11-01', '2026-10-31')).toBe(1);
    expect(daysUntilStart('2027-01-01', '2026-12-31')).toBe(1);
  });

  it('시작일에 시각이 붙어 있어도 날짜만 본다', () => {
    expect(daysUntilStart('2026-10-31T00:00:00', '2026-10-30')).toBe(1);
  });

  it('시작일이 없으면 0 (시작 전으로 보지 않음)', () => {
    expect(daysUntilStart(null, '2026-10-30')).toBe(0);
    expect(daysUntilStart(undefined, '2026-10-30')).toBe(0);
    expect(daysUntilStart('', '2026-10-30')).toBe(0);
  });
});

describe('isBeforeStart', () => {
  it('시작일이 오늘보다 뒤일 때만 true', () => {
    expect(isBeforeStart('2026-10-31', '2026-10-30')).toBe(true);
    expect(isBeforeStart('2026-10-30', '2026-10-30')).toBe(false);
    expect(isBeforeStart('2026-10-01', '2026-10-30')).toBe(false);
    expect(isBeforeStart(null, '2026-10-30')).toBe(false);
  });
});

describe('programWeekAndDay', () => {
  it('시작일 = 1주차 1일, 7일째 = 1주차 7일, 8일째 = 2주차 1일', () => {
    expect(programWeekAndDay('2026-10-30', '2026-10-30')).toEqual({
      week: 1,
      day: 1,
      beforeStart: false,
      daysUntilStart: 0,
    });
    expect(programWeekAndDay('2026-10-24', '2026-10-30')).toMatchObject({ week: 1, day: 7 });
    expect(programWeekAndDay('2026-10-23', '2026-10-30')).toMatchObject({ week: 2, day: 1 });
    expect(programWeekAndDay('2026-10-02', '2026-10-30')).toMatchObject({ week: 5, day: 1 });
  });

  it('시작 전이면 0·음수 대신 1주차 1일 + 남은 날', () => {
    expect(programWeekAndDay('2026-10-31', '2026-10-30')).toEqual({
      week: 1,
      day: 1,
      beforeStart: true,
      daysUntilStart: 1,
    });
    expect(programWeekAndDay('2026-11-09', '2026-10-30')).toEqual({
      week: 1,
      day: 1,
      beforeStart: true,
      daysUntilStart: 10,
    });
  });

  it('시작일이 없으면 1주차 1일', () => {
    expect(programWeekAndDay(null, '2026-10-30')).toEqual({
      week: 1,
      day: 1,
      beforeStart: false,
      daysUntilStart: 0,
    });
  });
});

describe('getWeekAndDay (KST 오늘 기준)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('시작일이 미래여도 주차·일차가 1 미만이 되지 않는다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T03:00:00Z')); // KST 10-30 12:00
    for (const start of ['2026-10-31', '2026-11-05', '2026-11-20']) {
      const { week, day } = getWeekAndDay(start);
      expect(week).toBe(1);
      expect(day).toBe(1);
    }
  });

  it('지난 시작일은 그대로 계산', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T03:00:00Z'));
    expect(getWeekAndDay('2026-10-23')).toEqual({ week: 2, day: 1 });
    expect(getWeekAndDay('2026-10-30')).toEqual({ week: 1, day: 1 });
  });

  it('KST 자정을 넘기면 다음 날로 본다 (UTC로는 아직 전날)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T15:30:00Z')); // KST 10-31 00:30
    expect(getWeekAndDay('2026-10-31')).toEqual({ week: 1, day: 1 });
    expect(getWeekAndDay('2026-10-30')).toEqual({ week: 1, day: 2 });
  });
});

describe('todayRevalidation (주차 팝업·할 일·단식 초기화)', () => {
  const started = { beforeStart: false };

  it('시작 전: 팝업을 열지 않고, 저장 주차는 1, 일차는 시작 전 표시(0)로 둔다', () => {
    const r = todayRevalidation({
      week: 1,
      day: 1,
      beforeStart: true,
      prevWeek: 1,
      prevDay: 1,
      isChecked: false,
    });
    expect(r.openPopup).toBe(false);
    expect(r.week).toBe(1);
    expect(r.day).toBe(BEFORE_START_DAY);
    expect(r.weekChanged).toBe(false);
    expect(r.dayChanged).toBe(true);
  });

  it('시작 전 상태가 이어지면 아무것도 바꾸지 않는다', () => {
    const r = todayRevalidation({
      week: 1,
      day: 1,
      beforeStart: true,
      prevWeek: 1,
      prevDay: BEFORE_START_DAY,
      isChecked: false,
    });
    expect(r).toMatchObject({ weekChanged: false, dayChanged: false, openPopup: false });
  });

  it('시작 전 → 시작일이 되면 일차가 바뀌어 할 일을 초기화한다 (팝업 없음)', () => {
    const r = todayRevalidation({
      week: 1,
      day: 1,
      ...started,
      prevWeek: 1,
      prevDay: BEFORE_START_DAY,
      isChecked: false,
    });
    expect(r).toMatchObject({ week: 1, day: 1, dayChanged: true, openPopup: false });
  });

  it('이전 저장 주차가 더 컸으면(다시 시작) 주차를 1로 내리고 팝업은 닫힌 것으로 둔다', () => {
    const r = todayRevalidation({
      week: 1,
      day: 1,
      beforeStart: true,
      prevWeek: 3,
      prevDay: 4,
      isChecked: true,
    });
    expect(r).toMatchObject({ week: 1, weekChanged: true, closePopup: true, openPopup: false });
  });

  it('시작 뒤에는 기존 규칙 그대로: 새 주차면 팝업', () => {
    const r = todayRevalidation({
      week: 2,
      day: 1,
      ...started,
      prevWeek: 1,
      prevDay: 7,
      isChecked: true,
    });
    expect(r).toMatchObject({
      week: 2,
      day: 1,
      weekChanged: true,
      dayChanged: true,
      closePopup: false,
      openPopup: true,
    });
  });
});

describe('todayRevalidation 서버 초기화 (시작 전엔 쓰지 않는다)', () => {
  it('시작 전으로 처음 들어와 일차가 0으로 바뀌어도 할 일 초기화(서버 쓰기)는 하지 않는다', () => {
    const r = todayRevalidation({
      week: 1,
      day: 1,
      beforeStart: true,
      prevWeek: 1,
      prevDay: 1,
      isChecked: false,
    });
    expect(r.dayChanged).toBe(true);
    expect(r.resetTodos).toBe(false);
    expect(r.resetFasting).toBe(false);
  });

  it('시작 전에 저장 주차가 1이 아니었어도 단식 초기화(서버 쓰기)는 하지 않는다', () => {
    const r = todayRevalidation({
      week: 1,
      day: 1,
      beforeStart: true,
      prevWeek: 3,
      prevDay: 4,
      isChecked: true,
    });
    expect(r.weekChanged).toBe(true);
    expect(r.resetFasting).toBe(false);
    expect(r.resetTodos).toBe(false);
  });

  it('시작일이 되면(0 → 1일) 할 일을 초기화한다', () => {
    const r = todayRevalidation({
      week: 1,
      day: 1,
      beforeStart: false,
      prevWeek: 1,
      prevDay: BEFORE_START_DAY,
      isChecked: false,
    });
    expect(r.resetTodos).toBe(true);
    expect(r.resetFasting).toBe(false);
  });

  it('시작 뒤 새 주차면 할 일·단식 모두 초기화', () => {
    const r = todayRevalidation({
      week: 2,
      day: 1,
      beforeStart: false,
      prevWeek: 1,
      prevDay: 7,
      isChecked: true,
    });
    expect(r.resetTodos).toBe(true);
    expect(r.resetFasting).toBe(true);
  });
});

describe('startCountdownLabel', () => {
  it('내일이면 "내일부터", 그 뒤면 "N일 뒤"', () => {
    expect(startCountdownLabel(1)).toBe('내일부터 1주차가 시작돼요');
    expect(startCountdownLabel(3)).toBe('3일 뒤 1주차가 시작돼요');
  });
});

describe('addDaysToDay', () => {
  it('KST 날짜에 n일을 더한다 (달·해 경계 포함)', () => {
    expect(addDaysToDay('2026-10-30', 1)).toBe('2026-10-31');
    expect(addDaysToDay('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('내일 시작으로 정하면 시작 전 1일', () => {
    expect(daysUntilStart(addDaysToDay('2026-10-30', 1), '2026-10-30')).toBe(1);
  });
});
