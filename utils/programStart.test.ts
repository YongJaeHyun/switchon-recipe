import { afterEach, describe, expect, it, vi } from 'vitest';
import { getKoreanDateString, getWeekAndDay } from './date';
import {
  addDaysToDay,
  adjustTarget,
  isSameStartDate,
  BEFORE_START_DAY,
  daysUntilStart,
  groupPastStarts,
  nextProgramStart,
  planToTouch,
  startDateChange,
  PROGRAM_CHAIN_DAYS,
  programStartOf,
  isBeforeStart,
  programWeekAndDay,
  restartStartDate,
  startCountdownLabel,
  startDateCleanup,
  startDateForWeekDay,
  todayRevalidation,
  startDateStatus,
  revalidateTodayPlan,
  weekDaySelection,
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

  it('시작 전에 저장 주차가 1이 아니었으면(다시 시작) 단식 계획은 지운다 — 할 일은 그대로', () => {
    // 3주차에서 미래 시작일로 다시 시작: 지금 주차가 1로 내려간다. 시작일에는 주차가 바뀌지 않아
    // 여기서 지우지 않으면 지난 프로그램의 단식 계획이 남는다
    const r = todayRevalidation({
      week: 1,
      day: 1,
      beforeStart: true,
      prevWeek: 3,
      prevDay: 4,
      isChecked: true,
    });
    expect(r.weekChanged).toBe(true);
    expect(r.resetFasting).toBe(true);
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

describe('todayRevalidation 한 주 더 하기 (시작일 +7일 → 주차 감소)', () => {
  it('4주차 1일 → 3주차 1일: 주차 팝업은 다시 열지 않고 닫힌 것으로 둔다', () => {
    // 팝업에서 "한 주 더 하기"를 누르면 close()로 isChecked = true가 된 뒤 시작일이 바뀐다
    const r = todayRevalidation({
      week: 3,
      day: 1,
      beforeStart: false,
      prevWeek: 4,
      prevDay: 1,
      isChecked: true,
    });
    expect(r).toMatchObject({
      week: 3,
      day: 1,
      weekChanged: true,
      dayChanged: false,
      closePopup: true,
      openPopup: false,
    });
  });

  it('같은 날 주차만 줄어도 할 일·단식 계획을 새 주차 기준으로 초기화한다', () => {
    // 할 일 목록은 주차마다 다르고 체크는 목록 순번이라, 4주차 체크가 3주차 목록에 남으면 안 된다
    const r = todayRevalidation({
      week: 3,
      day: 1,
      beforeStart: false,
      prevWeek: 4,
      prevDay: 1,
      isChecked: true,
    });
    expect(r.resetTodos).toBe(true);
    expect(r.resetFasting).toBe(true);
  });

  it('3주차 중간(5일)에 한 주 더 → 2주차 5일: 팝업 없음, 초기화', () => {
    const r = todayRevalidation({
      week: 2,
      day: 5,
      beforeStart: false,
      prevWeek: 3,
      prevDay: 5,
      isChecked: true,
    });
    expect(r).toMatchObject({
      week: 2,
      day: 5,
      closePopup: true,
      openPopup: false,
      resetTodos: true,
      resetFasting: true,
    });
  });

  it('팝업을 닫기 전에(isChecked false) 주차가 줄어도 다시 열지 않는다', () => {
    const r = todayRevalidation({
      week: 3,
      day: 1,
      beforeStart: false,
      prevWeek: 4,
      prevDay: 1,
      isChecked: false,
    });
    expect(r.openPopup).toBe(false);
    expect(r.closePopup).toBe(true);
  });

  it('줄어든 뒤 다음 재검증(같은 주차·닫힘)에서도 열지 않는다', () => {
    const r = todayRevalidation({
      week: 3,
      day: 2,
      beforeStart: false,
      prevWeek: 3,
      prevDay: 1,
      isChecked: true,
    });
    expect(r).toMatchObject({ openPopup: false, weekChanged: false, resetFasting: false });
  });

  it('한 주를 다시 한 뒤 다음 주차(4주차)에 들어서면 다시 연다', () => {
    const r = todayRevalidation({
      week: 4,
      day: 1,
      beforeStart: false,
      prevWeek: 3,
      prevDay: 7,
      isChecked: true,
    });
    expect(r.openPopup).toBe(true);
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

describe('startDateForWeekDay (주차 맞추기)', () => {
  it('1주차 1일이면 오늘이 시작일', () => {
    expect(startDateForWeekDay('2026-10-30', 1, 1)).toBe('2026-10-30');
  });

  it('2주차 3일이면 오늘 − (7 + 2)일', () => {
    expect(startDateForWeekDay('2026-10-30', 2, 3)).toBe('2026-10-21');
    expect(programWeekAndDay('2026-10-21', '2026-10-30')).toMatchObject({ week: 2, day: 3 });
  });

  it('4주차 7일이면 오늘 − 27일 (달이 바뀌는 경계)', () => {
    expect(startDateForWeekDay('2026-11-02', 4, 7)).toBe('2026-10-06');
  });

  it('유지기(5주차 이상)는 일차와 상관없이 5주차 1일로 계산', () => {
    expect(startDateForWeekDay('2026-10-30', 5, 1)).toBe('2026-10-02');
    expect(startDateForWeekDay('2026-10-30', 5, 6)).toBe('2026-10-02');
    expect(startDateForWeekDay('2026-10-30', 9, 3)).toBe('2026-10-02');
    expect(programWeekAndDay('2026-10-02', '2026-10-30')).toMatchObject({ week: 5, day: 1 });
  });

  it('미래 시작일은 만들지 않는다 (0·음수 주차·일차는 1로)', () => {
    expect(startDateForWeekDay('2026-10-30', 0, 0)).toBe('2026-10-30');
    expect(startDateForWeekDay('2026-10-30', -1, 3)).toBe('2026-10-28');
    expect(startDateForWeekDay('2026-10-30', 2, -4)).toBe('2026-10-23');
    for (let week = -2; week <= 7; week++) {
      for (let day = -2; day <= 9; day++) {
        expect(
          daysUntilStart(startDateForWeekDay('2026-10-30', week, day), '2026-10-30')
        ).toBeLessThanOrEqual(0);
      }
    }
  });

  it('일차가 7을 넘으면 7일로 본다', () => {
    expect(startDateForWeekDay('2026-10-30', 1, 10)).toBe('2026-10-24');
  });
});

describe('restartStartDate (처음부터 다시 시작)', () => {
  it('오늘부터면 오늘, 내일부터면 내일', () => {
    expect(restartStartDate('2026-10-30', 'today')).toBe('2026-10-30');
    expect(restartStartDate('2026-10-30', 'tomorrow')).toBe('2026-10-31');
  });

  it('해가 바뀌는 경계', () => {
    expect(restartStartDate('2026-12-31', 'tomorrow')).toBe('2027-01-01');
  });
});

describe('weekDaySelection (주차 맞추기 기본 선택)', () => {
  it('지금 주차·일차를 그대로', () => {
    expect(weekDaySelection('2026-10-21', '2026-10-30')).toEqual({ week: 2, day: 3 });
  });

  it('유지기면 5주차 1일', () => {
    expect(weekDaySelection('2026-09-01', '2026-10-30')).toEqual({ week: 5, day: 1 });
  });

  it('시작 전·시작일 없음이면 1주차 1일', () => {
    expect(weekDaySelection('2026-10-31', '2026-10-30')).toEqual({ week: 1, day: 1 });
    expect(weekDaySelection(null, '2026-10-30')).toEqual({ week: 1, day: 1 });
  });
});

describe('startDateCleanup (시작일 바꾼 뒤 정리할 것)', () => {
  const ing = (name: string, week: number) => ({ name, week });

  it('새 시작일 기준 오늘 주차·일차부터 통계를 지우고, 그 주차보다 높은 재료는 뺀다', () => {
    const plan = startDateCleanup({
      newStart: '2026-10-21',
      today: '2026-10-30',
      low: [ing('a', 1), ing('b', 2), ing('c', 3)],
      zero: [ing('z', 2)],
    });
    expect(plan.statisticsFrom).toEqual({ week: 2, day: 3 });
    expect(plan.low).toEqual([ing('a', 1), ing('b', 2)]);
    expect(plan.zero).toBeNull(); // 바뀐 게 없으면 저장하지 않는다
  });

  it('내일부터 다시 시작(시작 전)이면 1주차 1일부터 모두 지우고 1주차 재료만 남긴다', () => {
    const plan = startDateCleanup({
      newStart: '2026-10-31',
      today: '2026-10-30',
      low: [ing('a', 1), ing('b', 4)],
      zero: [ing('z', 3)],
    });
    expect(plan.statisticsFrom).toEqual({ week: 1, day: 1 });
    expect(plan.low).toEqual([ing('a', 1)]);
    expect(plan.zero).toEqual([]);
  });

  it('한 주 더 하기(시작일 +7)와 같은 결과', () => {
    // 4주차 1일에 한 주 더 → 3주차 1일
    const plan = startDateCleanup({
      newStart: addDaysToDay('2026-10-09', 7),
      today: '2026-10-30',
      low: [ing('a', 4)],
      zero: [],
    });
    expect(plan.statisticsFrom).toEqual({ week: 3, day: 1 });
    expect(plan.low).toEqual([]);
    expect(plan.zero).toBeNull();
  });
});

describe('주차 맞추기 KST 경계 (기기 시간대가 KST가 아닐 때)', () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTZ;
  });

  it('뉴욕 기기에서 KST 자정 직후: 오늘은 KST 날짜, 1주차 1일 = KST 오늘', () => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T15:30:00Z')); // KST 10-31 00:30, 뉴욕 10-30 11:30
    const today = getKoreanDateString({ formatType: 'date' });
    expect(today).toBe('2026-10-31');
    expect(startDateForWeekDay(today, 1, 1)).toBe('2026-10-31');
    expect(getWeekAndDay(startDateForWeekDay(today, 2, 3))).toEqual({ week: 2, day: 3 });
    expect(getWeekAndDay(restartStartDate(today, 'today'))).toEqual({ week: 1, day: 1 });
  });

  it('LA 기기에서 KST 자정 직전: 아직 KST 전날', () => {
    process.env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T14:59:00Z')); // KST 10-30 23:59
    const today = getKoreanDateString({ formatType: 'date' });
    expect(today).toBe('2026-10-30');
    expect(startDateForWeekDay(today, 4, 7)).toBe('2026-10-03');
    expect(getWeekAndDay(startDateForWeekDay(today, 4, 7))).toEqual({ week: 4, day: 7 });
  });
});

describe('adjustTarget (주차 맞추기로 바뀔 시작일, 그대로면 null)', () => {
  const today = '2026-10-30';

  it('지금 주차·일차를 그대로 고르면 null', () => {
    expect(adjustTarget('2026-10-21', today, { week: 2, day: 3 })).toBeNull();
  });

  it('다른 주차·일차면 새 시작일', () => {
    expect(adjustTarget('2026-10-21', today, { week: 2, day: 6 })).toBe('2026-10-18');
  });

  it('유지기 5주차 1일에 유지기를 고르면 null', () => {
    expect(adjustTarget('2026-10-02', today, { week: 5, day: 1 })).toBeNull();
  });

  it('유지기 5주차 4일에 유지기를 고르면 null (시작일을 옮기지 않는다)', () => {
    expect(adjustTarget('2026-09-29', today, { week: 5, day: 1 })).toBeNull();
  });

  it('유지기 7주차에 유지기를 고르면 null', () => {
    expect(adjustTarget('2026-09-15', today, { week: 5, day: 1 })).toBeNull();
  });

  it('유지기에서 주차를 고르면 그 주차로 옮긴다', () => {
    expect(adjustTarget('2026-09-15', today, { week: 4, day: 7 })).toBe('2026-10-03');
  });

  it('지금 3주차인데 유지기를 고르면 5주차 1일', () => {
    expect(adjustTarget('2026-10-16', today, { week: 5, day: 1 })).toBe('2026-10-02');
  });

  it('시작 전·시작일 없음이면 언제나 새 시작일 (1주차 1일 = 오늘)', () => {
    expect(adjustTarget('2026-10-31', today, { week: 1, day: 1 })).toBe('2026-10-30');
    expect(adjustTarget(null, today, { week: 1, day: 1 })).toBe('2026-10-30');
  });
});

describe('isSameStartDate (같은 시작일이면 저장·정리하지 않는다)', () => {
  it('날짜만 비교한다', () => {
    expect(isSameStartDate('2026-10-30', '2026-10-30')).toBe(true);
    expect(isSameStartDate('2026-10-30T00:00:00', '2026-10-30')).toBe(true);
    expect(isSameStartDate('2026-10-30', '2026-10-31')).toBe(false);
    expect(isSameStartDate(null, '2026-10-30')).toBe(false);
  });
});

describe('programStartOf (회차 시작일)', () => {
  it('program_start가 없으면(구버전 앱·마이그레이션 전) start_date', () => {
    expect(programStartOf(null, '2026-10-01')).toBe('2026-10-01');
    expect(programStartOf(undefined, '2026-10-01T00:00:00+09:00')).toBe('2026-10-01');
  });

  it('program_start가 start_date와 같거나 앞이면 program_start', () => {
    expect(programStartOf('2026-09-24', '2026-10-01')).toBe('2026-09-24');
    expect(programStartOf('2026-10-01', '2026-10-01')).toBe('2026-10-01');
  });

  it('program_start가 start_date보다 뒤면(구버전 앱이 시작일을 앞당김) start_date', () => {
    expect(programStartOf('2026-10-08', '2026-10-01')).toBe('2026-10-01');
  });

  it('program_start가 start_date보다 56일 넘게 앞이면(구버전 앱의 다시 시작이 남긴 옛 값) start_date', () => {
    expect(programStartOf('2026-08-06', '2026-10-01')).toBe('2026-08-06'); // 56일 전 = 같은 회차
    expect(programStartOf('2026-08-05', '2026-10-01')).toBe('2026-10-01'); // 57일 전
    expect(programStartOf('2026-01-01T00:00:00+09:00', '2026-10-01')).toBe('2026-10-01');
  });

  it('시작일을 모르면 null', () => {
    expect(programStartOf(null, null)).toBeNull();
    expect(programStartOf(null, '')).toBeNull();
  });
});

describe('nextProgramStart (시작일을 바꿀 때 회차 시작일)', () => {
  it('다시 시작은 새 시작일이 새 회차', () => {
    expect(nextProgramStart('restart', '2026-08-01', '2026-10-31')).toBe('2026-10-31');
  });

  it('주차 맞추기로 앞당기면 새 시작일', () => {
    expect(nextProgramStart('align', '2026-10-15', '2026-10-01')).toBe('2026-10-01');
  });

  it('주차 맞추기로 미루면 회차 시작일은 그대로', () => {
    expect(nextProgramStart('align', '2026-10-01', '2026-10-15')).toBe('2026-10-01');
  });

  it('한 주 더 하기는 그대로', () => {
    expect(nextProgramStart('repeat', '2026-10-01', '2026-10-08')).toBe('2026-10-01');
  });

  it('회차 시작일을 모르면 새 시작일', () => {
    expect(nextProgramStart('repeat', null, '2026-10-08')).toBe('2026-10-08');
    expect(nextProgramStart('align', null, '2026-10-08')).toBe('2026-10-08');
  });
});

describe('groupPastStarts (지난 회차 묶기)', () => {
  it('8주(56일)', () => expect(PROGRAM_CHAIN_DAYS).toBe(56));

  it('한 주 더 하기로 7일씩 밀린 시작일은 한 회차', () => {
    expect(groupPastStarts(['2026-08-15', '2026-08-01', '2026-08-08'], '2026-10-30')).toEqual([
      ['2026-08-01', '2026-08-08', '2026-08-15'],
    ]);
  });

  it('바로 앞 시작일과 56일 이내면 같은 회차, 57일이면 새 회차', () => {
    expect(groupPastStarts(['2026-01-01', '2026-02-26'], '2026-10-30')).toEqual([
      ['2026-01-01', '2026-02-26'],
    ]);
    expect(groupPastStarts(['2026-01-01', '2026-02-27'], '2026-10-30')).toEqual([
      ['2026-02-27'],
      ['2026-01-01'],
    ]);
  });

  it('이어지는 사슬이면 처음과 끝이 56일을 넘어도 한 회차', () => {
    expect(groupPastStarts(['2026-03-01', '2026-04-20', '2026-06-08'], '2026-10-30')).toEqual([
      ['2026-03-01', '2026-04-20', '2026-06-08'],
    ]);
  });

  it('회차 시작일 이후 시작일은 지금 회차라 빠지고, 중복·시각은 정리한다', () => {
    expect(
      groupPastStarts(
        ['2026-10-01', '2026-10-08', '2025-08-04', '2025-08-04T00:00:00+09:00'],
        '2026-10-01'
      )
    ).toEqual([['2025-08-04']]);
  });

  it('회차 시작일을 모르면 전부 지난 회차', () => {
    expect(groupPastStarts(['2026-10-01', '2025-08-04'], null)).toEqual([
      ['2026-10-01'],
      ['2025-08-04'],
    ]);
  });
});

describe('startDateChange (저장할 것)', () => {
  it('시작일이 바뀌면 시작일·회차 시작일을 저장하고 정리한다', () => {
    expect(
      startDateChange({
        kind: 'repeat',
        startDate: '2026-10-01',
        programStart: null,
        newStart: '2026-10-08',
      })
    ).toEqual({ programStart: '2026-10-01', startChanged: true });
  });

  it('같은 시작일이고 회차 시작일도 같으면 할 것이 없다', () => {
    expect(
      startDateChange({
        kind: 'restart',
        startDate: '2026-10-31',
        programStart: '2026-10-31',
        newStart: '2026-10-31',
      })
    ).toBeNull();
    expect(
      startDateChange({
        kind: 'align',
        startDate: '2026-10-08',
        programStart: '2026-10-01',
        newStart: '2026-10-08',
      })
    ).toBeNull();
  });

  it('같은 날 다시 시작인데 회차 시작일이 다르면 회차 시작일만 바꾼다 (정리하지 않음)', () => {
    expect(
      startDateChange({
        kind: 'restart',
        startDate: '2026-10-31',
        programStart: '2026-10-24',
        newStart: '2026-10-31',
      })
    ).toEqual({ programStart: '2026-10-31', startChanged: false });
  });
});

describe('startDateStatus (시작일을 아직 모르는지)', () => {
  it('유저를 아직 불러오지 않았으면(id 없음) 시작일이 비어 있어도 loading', () => {
    expect(startDateStatus({ userId: '', startDate: '' })).toBe('loading');
    expect(startDateStatus({ userId: '', startDate: null })).toBe('loading');
    expect(startDateStatus({ userId: undefined, startDate: undefined })).toBe('loading');
  });

  it('유저를 불러왔는데 시작일이 없으면 none', () => {
    expect(startDateStatus({ userId: 'u1', startDate: null })).toBe('none');
    expect(startDateStatus({ userId: 'u1', startDate: '' })).toBe('none');
  });

  it('시작일이 있으면 set', () => {
    expect(startDateStatus({ userId: 'u1', startDate: '2026-10-07' })).toBe('set');
  });
});

describe('revalidateTodayPlan (시작일을 모르면 아무것도 하지 않는다)', () => {
  // 운영자 계정: 시작일 2026-10-07, 오늘 2026-10-31 → 4주차 4일. 4주차 팝업은 이미 봤다
  const seen = { prevWeek: 4, prevDay: 4, isChecked: true, today: '2026-10-31' };

  it('유저를 불러오기 전(시작일 빈 값)에는 null: 주차를 1로 내리거나 할 일·단식을 초기화하지 않는다', () => {
    expect(revalidateTodayPlan({ ...seen, userId: '', startDate: '' })).toBeNull();
    expect(revalidateTodayPlan({ ...seen, userId: '', startDate: null })).toBeNull();
  });

  it('시작일이 없는 유저도 null (맞출 주차가 없다)', () => {
    expect(revalidateTodayPlan({ ...seen, userId: 'u1', startDate: null })).toBeNull();
  });

  it('시작일을 불러온 뒤 같은 주차·일차면 바꾸는 것 없음 (이미 본 팝업을 다시 열지 않음)', () => {
    const plan = revalidateTodayPlan({ ...seen, userId: 'u1', startDate: '2026-10-07' });
    expect(plan).toMatchObject({
      week: 4,
      day: 4,
      weekChanged: false,
      dayChanged: false,
      resetFasting: false,
      resetTodos: false,
      openPopup: false,
    });
  });

  it('시작일이 있으면 todayRevalidation과 같다 (날이 바뀌면 할 일 초기화)', () => {
    const plan = revalidateTodayPlan({
      ...seen,
      prevDay: 3,
      userId: 'u1',
      startDate: '2026-10-07',
    });
    expect(plan).toEqual(
      todayRevalidation({
        week: 4,
        day: 4,
        beforeStart: false,
        prevWeek: 4,
        prevDay: 3,
        isChecked: true,
      })
    );
    expect(plan?.resetTodos).toBe(true);
  });
});

describe('planToTouch (시작일을 바꾼 뒤 표시할 이번 주차 단식 계획)', () => {
  it('새 시작일의 오늘 주차 계획', () => {
    expect(planToTouch('2026-10-01', '2026-10-16')).toEqual({
      start_date: '2026-10-01',
      week_index: 3,
    });
  });

  it('1주차(단식 없음)나 시작 전이면 없다', () => {
    expect(planToTouch('2026-10-12', '2026-10-16')).toBeNull();
    expect(planToTouch('2026-10-17', '2026-10-16')).toBeNull();
  });

  it('시각이 붙은 시작일도 날짜로', () => {
    expect(planToTouch('2026-10-01T00:00:00+09:00', '2026-10-16')).toEqual({
      start_date: '2026-10-01',
      week_index: 3,
    });
  });
});
