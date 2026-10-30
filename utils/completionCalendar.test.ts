import { describe, expect, it } from 'vitest';
import { buildCompletionCalendar, toDayMark } from './completionCalendar';

describe('toDayMark', () => {
  it('100%는 완주', () => {
    expect(toDayMark(100, true)).toBe('full');
  });

  it('0과 100 사이는 일부', () => {
    expect(toDayMark(1, true)).toBe('partial');
    expect(toDayMark(99, true)).toBe('partial');
  });

  it('지난 날인데 0%거나 기록이 없으면 못 함', () => {
    expect(toDayMark(0, true)).toBe('missed');
    expect(toDayMark(null, true)).toBe('missed');
  });

  it('아직 안 온 날은 값이 있어도 아직', () => {
    expect(toDayMark(null, false)).toBe('upcoming');
    expect(toDayMark(0, false)).toBe('upcoming');
    expect(toDayMark(100, false)).toBe('upcoming');
  });
});

const empty = () => Array.from({ length: 4 }, () => Array<number | null>(7).fill(null));

describe('buildCompletionCalendar', () => {
  it('주차별 표시와 완주한 날 수, 오늘은 진행 중 주차·일차 한 칸', () => {
    const rates = empty();
    rates[0] = [100, 100, 100, 0, 100, 100, 100];
    rates[1] = [100, 100, 40, null, null, null, null];
    const calendar = buildCompletionCalendar(rates, { week: 2, day: 4, beforeStart: false });

    expect(calendar.weeks).toHaveLength(4);
    expect(calendar.weeks[0].days.map((d) => d.mark)).toEqual([
      'full',
      'full',
      'full',
      'missed',
      'full',
      'full',
      'full',
    ]);
    // 2주차 4일은 오늘: 지난 날로 보고(기록 없음 → 못 함) 오늘 표시
    expect(calendar.weeks[1].days.map((d) => d.mark)).toEqual([
      'full',
      'full',
      'partial',
      'missed',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(calendar.weeks[2].days.every((d) => d.mark === 'upcoming')).toBe(true);
    expect(calendar.fullCount).toBe(8);

    const today = calendar.weeks.flatMap((w) => w.days.filter((d) => d.isToday).map(() => w.week));
    expect(today).toEqual([2]);
    expect(calendar.weeks[1].days[3].isToday).toBe(true);
  });

  it('시작 전이면 모두 아직이고 오늘도 없다 (시작일이 없을 때 0으로 채운 값도 무시)', () => {
    const rates = Array.from({ length: 4 }, () => Array<number | null>(7).fill(0));
    const calendar = buildCompletionCalendar(rates, { week: 1, day: 1, beforeStart: true });

    expect(calendar.weeks.flatMap((w) => w.days).every((d) => d.mark === 'upcoming')).toBe(true);
    expect(calendar.weeks.flatMap((w) => w.days).some((d) => d.isToday)).toBe(false);
    expect(calendar.fullCount).toBe(0);
  });

  it('유지기(5주차 이후)는 프로그램 4주를 모두 지난 날로 보고 오늘 표시는 없다', () => {
    const rates = empty();
    rates[3] = [100, 0, 50, 100, 100, 100, 100];
    const calendar = buildCompletionCalendar(rates, { week: 6, day: 2, beforeStart: false });

    expect(calendar.weeks[0].days.every((d) => d.mark === 'missed')).toBe(true);
    expect(calendar.weeks[3].days.map((d) => d.mark)).toEqual([
      'full',
      'missed',
      'partial',
      'full',
      'full',
      'full',
      'full',
    ]);
    expect(calendar.weeks.flatMap((w) => w.days).some((d) => d.isToday)).toBe(false);
    expect(calendar.fullCount).toBe(5);
  });

  it('주차별 개수를 센다 (읽어 주기용)', () => {
    const rates = empty();
    rates[0] = [100, 50, 0, 100, null, null, null];
    const calendar = buildCompletionCalendar(rates, { week: 1, day: 4, beforeStart: false });

    expect(calendar.weeks[0].counts).toEqual({ full: 2, partial: 1, missed: 1, upcoming: 3 });
  });

  it('데이터가 없으면(불러오는 중) 빈 4주 달력', () => {
    const calendar = buildCompletionCalendar(undefined, { week: 2, day: 1, beforeStart: false });

    expect(calendar.weeks).toHaveLength(4);
    expect(calendar.weeks.every((w) => w.days.length === 7)).toBe(true);
    expect(calendar.fullCount).toBe(0);
  });
});
