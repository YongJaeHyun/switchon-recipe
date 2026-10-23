import { describe, expect, it } from 'vitest';
import {
  fastingResultWindow,
  getFastingStatus,
  getTodoAction,
  fastingWeekBoundary,
  formatKstClock,
  WEEK_CHANGES,
} from './dietGuide';
import type { FastingSchedule } from './fastingSchedule';

// 같은 시각을 여러 요일에 (옛 라벨 = 모든 요일 같은 분)
const at = (days: number[], minutes: number): FastingSchedule =>
  Object.fromEntries(days.map((day) => [day, minutes]));

describe('getTodoAction', () => {
  it('links low-carb meals to the low-carb recipe screen', () => {
    expect(getTodoAction('점심 저탄수식 먹기')).toEqual({
      type: 'route',
      label: '레시피 만들기',
      href: '/recipeCreation/low',
    });
  });

  it('links zero-carb meals to the zero-carb recipe screen', () => {
    expect(getTodoAction('저녁 무탄수식 먹기')).toMatchObject({
      type: 'route',
      href: '/recipeCreation/zero',
    });
  });

  it('gives a structured tip for protein shakes', () => {
    const action = getTodoAction('아침 프로틴쉐이크 마시기');
    expect(action).toMatchObject({ type: 'tip', label: '팁' });
    if (action?.type !== 'tip') return;
    expect(action.tip.title).toBe('프로틴쉐이크 팁');
    expect(action.tip.points.length).toBeGreaterThanOrEqual(3);
    for (const point of action.tip.points) {
      expect(point.title.length).toBeGreaterThan(0);
      expect(point.text.length).toBeGreaterThan(0);
    }
  });

  it('has no action for other todos', () => {
    expect(getTodoAction('물 마시기')).toBeNull();
  });
});

describe('WEEK_CHANGES', () => {
  it('describes what changes for weeks 2 to 5', () => {
    for (const week of [2, 3, 4, 5]) expect(WEEK_CHANGES[week]?.length).toBeGreaterThan(0);
  });
});

describe('getFastingStatus', () => {
  // 2026-10-19(월) KST. 단식 요일 월(1), 저녁 식후(19시 KST) 시작 → 화 19시 종료
  const kst = (iso: string) => new Date(`${iso}+09:00`);
  const days = [1];

  it('is not fasting before the start time on a fasting day', () => {
    expect(getFastingStatus(kst('2026-10-19T18:59:00'), at(days, 1140))).toMatchObject({
      phase: 'upcoming',
      startsAt: kst('2026-10-19T19:00:00'),
    });
  });

  it('is fasting after the start and counts down to the end', () => {
    expect(getFastingStatus(kst('2026-10-19T20:00:00'), at(days, 1140))).toEqual({
      phase: 'fasting',
      startsAt: kst('2026-10-19T19:00:00'),
      endsAt: kst('2026-10-20T19:00:00'),
      remainingMs: 23 * 60 * 60 * 1000,
    });
  });

  it('is still fasting the next day until the end', () => {
    expect(getFastingStatus(kst('2026-10-20T10:00:00'), at(days, 1140))).toMatchObject({
      phase: 'fasting',
      remainingMs: 9 * 60 * 60 * 1000,
    });
  });

  it('is finished right after the end on the next day', () => {
    expect(getFastingStatus(kst('2026-10-20T19:30:00'), at(days, 1140))).toMatchObject({
      phase: 'finished',
    });
  });

  it('is none on unrelated days or without settings', () => {
    expect(getFastingStatus(kst('2026-10-22T12:00:00'), at(days, 1140)).phase).toBe('none');
    expect(getFastingStatus(kst('2026-10-19T20:00:00'), {}).phase).toBe('none');
  });

  it('uses 9 and 13 for breakfast and lunch', () => {
    expect(getFastingStatus(kst('2026-10-19T09:30:00'), at(days, 540))).toMatchObject({
      phase: 'fasting',
      endsAt: kst('2026-10-20T09:00:00'),
    });
    expect(getFastingStatus(kst('2026-10-19T12:00:00'), at(days, 780))).toMatchObject({
      phase: 'upcoming',
    });
  });

  it('handles a Saturday fast that ends on Sunday', () => {
    expect(getFastingStatus(kst('2026-10-25T08:00:00'), at([6], 1140))).toMatchObject({
      phase: 'fasting',
    });
  });
});

describe('fastingResultWindow', () => {
  // 월(1) 저녁 식후: 10-19 19시 시작 → 10-20 19시 종료 → 응답은 10-22 19시까지
  const kst = (iso: string) => new Date(`${iso}+09:00`);

  it('is closed before the fast starts', () => {
    expect(fastingResultWindow(kst('2026-10-19T18:59:00'), at([1], 1140))).toBeNull();
  });

  it('is closed during the fast and opens when it ends, keyed by the start day', () => {
    expect(fastingResultWindow(kst('2026-10-19T19:00:00'), at([1], 1140))).toBeNull();
    expect(fastingResultWindow(kst('2026-10-20T18:59:00'), at([1], 1140))).toBeNull();
    expect(fastingResultWindow(kst('2026-10-20T19:00:00'), at([1], 1140))).toEqual({
      day: '2026-10-19',
    });
  });

  it('stays open for 48 hours after the end', () => {
    expect(fastingResultWindow(kst('2026-10-21T12:00:00'), at([1], 1140))).toEqual({
      day: '2026-10-19',
    });
    expect(fastingResultWindow(kst('2026-10-22T18:59:00'), at([1], 1140))).toEqual({
      day: '2026-10-19',
    });
    expect(fastingResultWindow(kst('2026-10-22T19:00:00'), at([1], 1140))).toBeNull();
  });

  it('closes when the next fast starts and asks about it after it ends', () => {
    // 월·수 단식: 수 19시에 다음 단식이 시작되면 월 단식 응답은 닫히고, 수 단식은 끝난 뒤에 묻는다
    expect(fastingResultWindow(kst('2026-10-21T18:59:00'), at([1, 3], 1140))).toEqual({
      day: '2026-10-19',
    });
    expect(fastingResultWindow(kst('2026-10-21T19:00:00'), at([1, 3], 1140))).toBeNull();
    expect(fastingResultWindow(kst('2026-10-22T19:00:00'), at([1, 3], 1140))).toEqual({
      day: '2026-10-21',
    });
  });

  it('uses the KST date of a morning start across the week boundary', () => {
    // 일(0) 아침 식후: 10-25 09시 시작 → 10-26 09시 종료. KST 일요일 = UTC 일요일 00시
    expect(fastingResultWindow(kst('2026-10-26T10:00:00'), at([0], 540))).toEqual({
      day: '2026-10-25',
    });
  });

  it('is null without settings', () => {
    expect(fastingResultWindow(kst('2026-10-19T20:00:00'), at([], 1140))).toBeNull();
    expect(fastingResultWindow(kst('2026-10-19T20:00:00'), {})).toBeNull();
  });
});

describe('fastingResultWindow across a week change', () => {
  // 지난 주차 마지막 날 = 10-25(일). 일 저녁 식후 단식 → 10-26 19시 종료 → 10-28 19시까지 응답.
  // 새 주차(10-26~)가 되면 단식 설정이 초기화돼 현재 요일 목록은 비어 있다
  const kst = (iso: string) => new Date(`${iso}+09:00`);
  const previous = { 0: 1140 };

  it('keeps the last-day fast of the previous week answerable after the reset', () => {
    expect(
      fastingResultWindow(kst('2026-10-27T12:00:00'), {}, { from: '2026-10-26', previous })
    ).toEqual({
      day: '2026-10-25',
    });
    expect(
      fastingResultWindow(kst('2026-10-28T19:00:00'), {}, { from: '2026-10-26', previous })
    ).toBeNull();
  });

  it('does not apply the previous week days after its last day', () => {
    // 지난 주 단식이 월(1)이었어도 새 주차 10-26(월)에는 적용하지 않는다
    const prevMonday = { 1: 1140 };
    expect(
      fastingResultWindow(
        kst('2026-10-26T20:00:00'),
        {},
        {
          from: '2026-10-26',
          previous: prevMonday,
        }
      )
    ).toBeNull();
  });

  it('does not apply the current week days before the week starts', () => {
    // 새 주차에 일(0)을 골라도 지난 주 10-25(일)은 지난 주 계획(토)으로만 본다
    const prevSaturday = { 6: 540 };
    expect(
      fastingResultWindow(kst('2026-10-26T08:00:00'), at([0], 1140), {
        from: '2026-10-26',
        previous: prevSaturday,
      })
    ).toEqual({ day: '2026-10-24' });
  });

  it('a new fast in the current week takes over the previous one', () => {
    // 새 주차 화(2) 저녁 단식이 시작되면 지난 주 일요일 단식 응답은 닫히고, 화 단식은 끝난 뒤에 묻는다
    expect(
      fastingResultWindow(kst('2026-10-27T19:00:00'), at([2], 1140), {
        from: '2026-10-26',
        previous,
      })
    ).toBeNull();
    expect(
      fastingResultWindow(kst('2026-10-28T19:00:00'), at([2], 1140), {
        from: '2026-10-26',
        previous,
      })
    ).toEqual({
      day: '2026-10-27',
    });
    expect(
      fastingResultWindow(kst('2026-10-27T18:00:00'), at([2], 1140), {
        from: '2026-10-26',
        previous,
      })
    ).toEqual({
      day: '2026-10-25',
    });
  });
});

describe('fastingResultWindow week boundary without a previous plan', () => {
  const kst = (iso: string) => new Date(`${iso}+09:00`);

  it('does not ask about a week-1 fast when week 2 days are picked on day 1', () => {
    // 시작일 10-01(목). 2주차 첫날 10-08에 화(2) 저녁을 고름 → 10-06(1주차)은 단식이 아니다
    expect(
      fastingResultWindow(kst('2026-10-08T12:00:00'), at([2], 1140), { from: '2026-10-08' })
    ).toBeNull();
  });

  it('skips previous-week dates while the previous plan is missing', () => {
    expect(
      fastingResultWindow(kst('2026-10-27T12:00:00'), at([0], 1140), {
        from: '2026-10-26',
        previous: null,
      })
    ).toBeNull();
  });

  it('still uses the current days inside the current week', () => {
    expect(
      fastingResultWindow(kst('2026-10-10T12:00:00'), at([4], 1140), { from: '2026-10-08' })
    ).toEqual({ day: '2026-10-08' });
  });
});

describe('fastingWeekBoundary', () => {
  it('is the current week first day and the previous fasting week', () => {
    expect(fastingWeekBoundary('2026-10-01', 3)).toEqual({
      from: '2026-10-15',
      previousWeekIndex: 2,
    });
    expect(fastingWeekBoundary('2026-10-01T00:00:00+09:00', 2)).toEqual({
      from: '2026-10-08',
      previousWeekIndex: null,
    });
  });

  it('is null without a start date', () => {
    expect(fastingWeekBoundary('', 3)).toBeNull();
    expect(fastingWeekBoundary(null, 3)).toBeNull();
  });
});

describe('요일마다 다른 시작 시각', () => {
  // 2026-10-22 = 목(4) 13:00 시작, 2026-10-24 = 토(6) 19:00 시작
  const kst = (iso: string) => new Date(`${iso}+09:00`);
  const schedule: FastingSchedule = { 4: 780, 6: 1140 };

  it('단식 상태는 그 요일 시각 기준', () => {
    expect(getFastingStatus(kst('2026-10-22T12:59:00'), schedule)).toEqual({
      phase: 'upcoming',
      startsAt: kst('2026-10-22T13:00:00'),
    });
    expect(getFastingStatus(kst('2026-10-23T12:00:00'), schedule)).toEqual({
      phase: 'fasting',
      startsAt: kst('2026-10-22T13:00:00'),
      endsAt: kst('2026-10-23T13:00:00'),
      remainingMs: 60 * 60 * 1000,
    });
    expect(getFastingStatus(kst('2026-10-23T13:30:00'), schedule)).toEqual({
      phase: 'finished',
      endsAt: kst('2026-10-23T13:00:00'),
    });
    // 토요일은 13시가 아니라 19시
    expect(getFastingStatus(kst('2026-10-24T13:30:00'), schedule)).toEqual({
      phase: 'upcoming',
      startsAt: kst('2026-10-24T19:00:00'),
    });
    expect(getFastingStatus(kst('2026-10-25T18:00:00'), schedule)).toMatchObject({
      phase: 'fasting',
      endsAt: kst('2026-10-25T19:00:00'),
    });
  });

  it('결과 응답 창과 다음 단식 시작 판단도 각 요일 시각 기준', () => {
    expect(fastingResultWindow(kst('2026-10-23T12:59:00'), schedule)).toBeNull();
    expect(fastingResultWindow(kst('2026-10-23T13:00:00'), schedule)).toEqual({
      day: '2026-10-22',
    });
    // 토 13:30: 토 단식(19시)은 아직 시작 전이라 목 단식 응답이 열려 있다
    expect(fastingResultWindow(kst('2026-10-24T13:30:00'), schedule)).toEqual({
      day: '2026-10-22',
    });
    expect(fastingResultWindow(kst('2026-10-24T18:59:00'), schedule)).toEqual({
      day: '2026-10-22',
    });
    expect(fastingResultWindow(kst('2026-10-24T19:00:00'), schedule)).toBeNull();
    expect(fastingResultWindow(kst('2026-10-25T19:00:00'), schedule)).toEqual({
      day: '2026-10-24',
    });
  });

  it('지난 주차 계획(previous)도 요일별 시각을 쓴다', () => {
    // 지난 주 일(0) 10:00 시작 → 월 10:00 끝. 이번 주 화(2) 13:00 단식
    const week = { from: '2026-10-26', previous: { 0: 600 } };
    expect(fastingResultWindow(kst('2026-10-26T09:59:00'), { 2: 780 }, week)).toBeNull();
    expect(fastingResultWindow(kst('2026-10-26T10:30:00'), { 2: 780 }, week)).toEqual({
      day: '2026-10-25',
    });
    expect(fastingResultWindow(kst('2026-10-27T12:59:00'), { 2: 780 }, week)).toEqual({
      day: '2026-10-25',
    });
    expect(fastingResultWindow(kst('2026-10-27T13:00:00'), { 2: 780 }, week)).toBeNull();
  });

  it('지도에 없는 요일은 단식일이 아니다', () => {
    expect(getFastingStatus(kst('2026-10-21T20:00:00'), schedule).phase).toBe('none');
    expect(fastingResultWindow(kst('2026-10-22T09:00:00'), schedule)).toBeNull();
  });
});

describe('자정을 넘는 22:00 시작', () => {
  // 월(1) 2026-10-19 22:00 KST(= 13:00 UTC) 시작 → 화 22:00 끝
  const kst = (iso: string) => new Date(`${iso}+09:00`);
  const schedule: FastingSchedule = { 1: 1320 };

  it('KST 자정을 넘어도 같은 단식이 이어진다 (UTC로는 아직 월요일)', () => {
    expect(getFastingStatus(kst('2026-10-19T21:59:00'), schedule)).toEqual({
      phase: 'upcoming',
      startsAt: kst('2026-10-19T22:00:00'),
    });
    // KST 화 00:30 = UTC 월 15:30
    expect(getFastingStatus(new Date('2026-10-19T15:30:00Z'), schedule)).toEqual({
      phase: 'fasting',
      startsAt: kst('2026-10-19T22:00:00'),
      endsAt: kst('2026-10-20T22:00:00'),
      remainingMs: 21.5 * 60 * 60 * 1000,
    });
    expect(getFastingStatus(kst('2026-10-20T22:00:00'), schedule)).toMatchObject({
      phase: 'finished',
    });
  });

  it('결과 응답 창은 화 22:00 ~ 목 22:00, 시작일은 KST 월요일', () => {
    expect(fastingResultWindow(new Date('2026-10-19T15:30:00Z'), schedule)).toBeNull();
    expect(fastingResultWindow(kst('2026-10-20T21:59:00'), schedule)).toBeNull();
    expect(fastingResultWindow(kst('2026-10-20T22:00:00'), schedule)).toEqual({
      day: '2026-10-19',
    });
    expect(fastingResultWindow(kst('2026-10-22T21:59:00'), schedule)).toEqual({
      day: '2026-10-19',
    });
    expect(fastingResultWindow(kst('2026-10-22T22:00:00'), schedule)).toBeNull();
  });

  it('지난 주 일요일 22:00 단식은 새 주차 첫날 밤까지 진행, 끝나면 묻는다', () => {
    const week = { from: '2026-10-26', previous: { 0: 1320 } };
    // KST 월 00:30 = UTC 일 15:30
    expect(fastingResultWindow(new Date('2026-10-25T15:30:00Z'), {}, week)).toBeNull();
    expect(fastingResultWindow(kst('2026-10-26T22:00:00'), {}, week)).toEqual({
      day: '2026-10-25',
    });
  });
});

describe('getFastingStatus 겹침과 주차 경계', () => {
  const kst = (iso: string) => new Date(`${iso}+09:00`);

  it('오늘 시작한 단식이 어제 시작해 아직 진행 중인 단식보다 우선한다', () => {
    // 월 22:00 단식(화 22:00까지) 중 화 06:00 단식이 시작됨
    expect(getFastingStatus(kst('2026-10-20T07:00:00'), { 1: 1320, 2: 360 })).toMatchObject({
      phase: 'fasting',
      startsAt: kst('2026-10-20T06:00:00'),
    });
  });

  it('새 주차 첫날에도 지난 주 일요일 단식이 진행 중이면 진행 줄', () => {
    const week = { from: '2026-10-26', previous: { 0: 1320 } };
    // 초기화된 이번 주 설정({})만 보면 none
    expect(getFastingStatus(kst('2026-10-26T10:00:00'), {}).phase).toBe('none');
    expect(getFastingStatus(kst('2026-10-26T10:00:00'), {}, week)).toEqual({
      phase: 'fasting',
      startsAt: kst('2026-10-25T22:00:00'),
      endsAt: kst('2026-10-26T22:00:00'),
      remainingMs: 12 * 60 * 60 * 1000,
    });
    expect(getFastingStatus(kst('2026-10-26T22:00:00'), {}, week).phase).toBe('finished');
    // 지난 계획이 없으면(불러오는 중) 지난 주 날짜는 보지 않는다
    expect(getFastingStatus(kst('2026-10-26T10:00:00'), {}, { from: '2026-10-26' }).phase).toBe(
      'none'
    );
    // 지난 주 요일 목록을 이번 주 날짜에 쓰지 않는다
    expect(getFastingStatus(kst('2026-10-26T10:00:00'), { 0: 1320 }, week).phase).toBe('fasting');
    expect(
      getFastingStatus(kst('2026-10-27T10:00:00'), {}, { from: '2026-10-26', previous: { 1: 600 } })
        .phase
    ).toBe('none');
  });
});

describe('formatKstClock', () => {
  it('기기 시간대와 상관없이 KST 시각 "HH:MM"', () => {
    expect(formatKstClock(new Date('2026-10-19T13:00:00Z'))).toBe('22:00');
    expect(formatKstClock(new Date('2026-10-19T15:30:00Z'))).toBe('00:30');
    expect(formatKstClock(new Date('2026-10-19T10:30:00+09:00'))).toBe('10:30');
  });
});
