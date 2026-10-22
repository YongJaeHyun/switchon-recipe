import { describe, expect, it } from 'vitest';
import { fastingResultWindow, getFastingStatus, getTodoAction, WEEK_CHANGES } from './dietGuide';

describe('getTodoAction', () => {
  it('links low-carb meals to the low-carb recipe screen', () => {
    expect(getTodoAction('점심 저탄수식 먹기')).toEqual({
      type: 'route',
      label: '레시피 만들기',
      href: '/(tabs)/home/recipeCreation/low',
    });
  });

  it('links zero-carb meals to the zero-carb recipe screen', () => {
    expect(getTodoAction('저녁 무탄수식 먹기')).toMatchObject({
      type: 'route',
      href: '/(tabs)/home/recipeCreation/zero',
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

  it('opens during the fast, keyed by the start day', () => {
    expect(fastingResultWindow(kst('2026-10-19T19:00:00'), [1], '저녁 식후')).toEqual({
      day: '2026-10-19',
    });
    expect(fastingResultWindow(kst('2026-10-20T10:00:00'), [1], '저녁 식후')).toEqual({
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

  it('closes when the next fast starts and switches to it', () => {
    // 월·수 단식: 수 19시에 다음 단식이 시작되면 월 단식 응답은 닫힌다
    expect(fastingResultWindow(kst('2026-10-21T18:59:00'), [1, 3], '저녁 식후')).toEqual({
      day: '2026-10-19',
    });
    expect(fastingResultWindow(kst('2026-10-21T19:00:00'), [1, 3], '저녁 식후')).toEqual({
      day: '2026-10-21',
    });
  });

  it('uses the KST date of a morning start across the week boundary', () => {
    // 일(0) 아침 식후: 10-25 09시 시작. KST 일요일 = UTC 일요일 00시
    expect(fastingResultWindow(kst('2026-10-26T08:00:00'), [0], '아침 식후')).toEqual({
      day: '2026-10-25',
    });
  });

  it('is null without settings', () => {
    expect(fastingResultWindow(kst('2026-10-19T20:00:00'), [], '저녁 식후')).toBeNull();
    expect(fastingResultWindow(kst('2026-10-19T20:00:00'), [1], null)).toBeNull();
  });
});
