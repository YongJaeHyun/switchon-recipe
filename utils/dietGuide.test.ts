import { describe, expect, it } from 'vitest';
import {
  fastingResultWindow,
  getFastingStatus,
  getTodoAction,
  fastingWeekBoundary,
  WEEK_CHANGES,
} from './dietGuide';

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
    expect(getFastingStatus(kst('2026-10-19T18:59:00'), days, '저녁 식후')).toMatchObject({
      phase: 'upcoming',
      startsAt: kst('2026-10-19T19:00:00'),
    });
  });

  it('is fasting after the start and counts down to the end', () => {
    expect(getFastingStatus(kst('2026-10-19T20:00:00'), days, '저녁 식후')).toEqual({
      phase: 'fasting',
      startsAt: kst('2026-10-19T19:00:00'),
      endsAt: kst('2026-10-20T19:00:00'),
      remainingMs: 23 * 60 * 60 * 1000,
    });
  });

  it('is still fasting the next day until the end', () => {
    expect(getFastingStatus(kst('2026-10-20T10:00:00'), days, '저녁 식후')).toMatchObject({
      phase: 'fasting',
      remainingMs: 9 * 60 * 60 * 1000,
    });
  });

  it('is finished right after the end on the next day', () => {
    expect(getFastingStatus(kst('2026-10-20T19:30:00'), days, '저녁 식후')).toMatchObject({
      phase: 'finished',
    });
  });

  it('is none on unrelated days or without settings', () => {
    expect(getFastingStatus(kst('2026-10-22T12:00:00'), days, '저녁 식후').phase).toBe('none');
    expect(getFastingStatus(kst('2026-10-19T20:00:00'), [], null).phase).toBe('none');
  });

  it('uses 9 and 13 for breakfast and lunch', () => {
    expect(getFastingStatus(kst('2026-10-19T09:30:00'), days, '아침 식후')).toMatchObject({
      phase: 'fasting',
      endsAt: kst('2026-10-20T09:00:00'),
    });
    expect(getFastingStatus(kst('2026-10-19T12:00:00'), days, '점심 식후')).toMatchObject({
      phase: 'upcoming',
    });
  });

  it('handles a Saturday fast that ends on Sunday', () => {
    expect(getFastingStatus(kst('2026-10-25T08:00:00'), [6], '저녁 식후')).toMatchObject({
      phase: 'fasting',
    });
  });
});

describe('fastingResultWindow', () => {
  // 월(1) 저녁 식후: 10-19 19시 시작 → 10-20 19시 종료 → 응답은 10-22 19시까지
  const kst = (iso: string) => new Date(`${iso}+09:00`);

  it('is closed before the fast starts', () => {
    expect(fastingResultWindow(kst('2026-10-19T18:59:00'), [1], '저녁 식후')).toBeNull();
  });

  it('is closed during the fast and opens when it ends, keyed by the start day', () => {
    expect(fastingResultWindow(kst('2026-10-19T19:00:00'), [1], '저녁 식후')).toBeNull();
    expect(fastingResultWindow(kst('2026-10-20T18:59:00'), [1], '저녁 식후')).toBeNull();
    expect(fastingResultWindow(kst('2026-10-20T19:00:00'), [1], '저녁 식후')).toEqual({
      day: '2026-10-19',
    });
  });

  it('stays open for 48 hours after the end', () => {
    expect(fastingResultWindow(kst('2026-10-21T12:00:00'), [1], '저녁 식후')).toEqual({
      day: '2026-10-19',
    });
    expect(fastingResultWindow(kst('2026-10-22T18:59:00'), [1], '저녁 식후')).toEqual({
      day: '2026-10-19',
    });
    expect(fastingResultWindow(kst('2026-10-22T19:00:00'), [1], '저녁 식후')).toBeNull();
  });

  it('closes when the next fast starts and asks about it after it ends', () => {
    // 월·수 단식: 수 19시에 다음 단식이 시작되면 월 단식 응답은 닫히고, 수 단식은 끝난 뒤에 묻는다
    expect(fastingResultWindow(kst('2026-10-21T18:59:00'), [1, 3], '저녁 식후')).toEqual({
      day: '2026-10-19',
    });
    expect(fastingResultWindow(kst('2026-10-21T19:00:00'), [1, 3], '저녁 식후')).toBeNull();
    expect(fastingResultWindow(kst('2026-10-22T19:00:00'), [1, 3], '저녁 식후')).toEqual({
      day: '2026-10-21',
    });
  });

  it('uses the KST date of a morning start across the week boundary', () => {
    // 일(0) 아침 식후: 10-25 09시 시작 → 10-26 09시 종료. KST 일요일 = UTC 일요일 00시
    expect(fastingResultWindow(kst('2026-10-26T10:00:00'), [0], '아침 식후')).toEqual({
      day: '2026-10-25',
    });
  });

  it('is null without settings', () => {
    expect(fastingResultWindow(kst('2026-10-19T20:00:00'), [], '저녁 식후')).toBeNull();
    expect(fastingResultWindow(kst('2026-10-19T20:00:00'), [1], null)).toBeNull();
  });
});

describe('fastingResultWindow across a week change', () => {
  // 지난 주차 마지막 날 = 10-25(일). 일 저녁 식후 단식 → 10-26 19시 종료 → 10-28 19시까지 응답.
  // 새 주차(10-26~)가 되면 단식 설정이 초기화돼 현재 요일 목록은 비어 있다
  const kst = (iso: string) => new Date(`${iso}+09:00`);
  const previous = { days: [0], startTime: '저녁 식후' as const };

  it('keeps the last-day fast of the previous week answerable after the reset', () => {
    expect(
      fastingResultWindow(kst('2026-10-27T12:00:00'), [], null, { from: '2026-10-26', previous })
    ).toEqual({
      day: '2026-10-25',
    });
    expect(
      fastingResultWindow(kst('2026-10-28T19:00:00'), [], null, { from: '2026-10-26', previous })
    ).toBeNull();
  });

  it('does not apply the previous week days after its last day', () => {
    // 지난 주 단식이 월(1)이었어도 새 주차 10-26(월)에는 적용하지 않는다
    const prevMonday = { days: [1], startTime: '저녁 식후' as const };
    expect(
      fastingResultWindow(kst('2026-10-26T20:00:00'), [], null, {
        from: '2026-10-26',
        previous: prevMonday,
      })
    ).toBeNull();
  });

  it('does not apply the current week days before the week starts', () => {
    // 새 주차에 일(0)을 골라도 지난 주 10-25(일)은 지난 주 계획(토)으로만 본다
    const prevSaturday = { days: [6], startTime: '아침 식후' as const };
    expect(
      fastingResultWindow(kst('2026-10-26T08:00:00'), [0], '저녁 식후', {
        from: '2026-10-26',
        previous: prevSaturday,
      })
    ).toEqual({ day: '2026-10-24' });
  });

  it('a new fast in the current week takes over the previous one', () => {
    // 새 주차 화(2) 저녁 단식이 시작되면 지난 주 일요일 단식 응답은 닫히고, 화 단식은 끝난 뒤에 묻는다
    expect(
      fastingResultWindow(kst('2026-10-27T19:00:00'), [2], '저녁 식후', {
        from: '2026-10-26',
        previous,
      })
    ).toBeNull();
    expect(
      fastingResultWindow(kst('2026-10-28T19:00:00'), [2], '저녁 식후', {
        from: '2026-10-26',
        previous,
      })
    ).toEqual({
      day: '2026-10-27',
    });
    expect(
      fastingResultWindow(kst('2026-10-27T18:00:00'), [2], '저녁 식후', {
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
      fastingResultWindow(kst('2026-10-08T12:00:00'), [2], '저녁 식후', { from: '2026-10-08' })
    ).toBeNull();
  });

  it('skips previous-week dates while the previous plan is missing', () => {
    expect(
      fastingResultWindow(kst('2026-10-27T12:00:00'), [0], '저녁 식후', {
        from: '2026-10-26',
        previous: null,
      })
    ).toBeNull();
  });

  it('still uses the current days inside the current week', () => {
    expect(
      fastingResultWindow(kst('2026-10-10T12:00:00'), [4], '저녁 식후', { from: '2026-10-08' })
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
