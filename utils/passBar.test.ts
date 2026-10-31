import { describe, expect, it } from 'vitest';
import { passBar } from './passBar';

describe('passBar', () => {
  it('재시작한 날(10/31 시작, 패스 12/5까지)에 5주 연장: 오늘부터 1~4주차·유지기, 지금 패스는 35일', () => {
    expect(
      passBar({ startDate: '2026-10-31', today: '2026-10-31', passEnd: '2026-12-05', days: 35 })
    ).toEqual({
      totalDays: 70,
      currentDays: 35,
      currentEndsOn: '12월 5일',
      endsOn: '1월 9일',
      weeks: [
        { week: 1, current: 7, extension: 0 },
        { week: 2, current: 7, extension: 0 },
        { week: 3, current: 7, extension: 0 },
        { week: 4, current: 7, extension: 0 },
        { week: 5, current: 7, extension: 35 },
      ],
    });
  });

  it('프로그램 중간(3주차 3일째)에 패스가 10일 남았으면 연장분은 그 뒤 주차부터', () => {
    // 시작 10-07 → 10-23이 3주차 3일째, 패스 11-02까지(10일), +7일
    expect(
      passBar({ startDate: '2026-10-07', today: '2026-10-23', passEnd: '2026-11-02', days: 7 })
    ).toEqual({
      totalDays: 17,
      currentDays: 10,
      currentEndsOn: '11월 2일',
      endsOn: '11월 9일',
      weeks: [
        { week: 3, current: 5, extension: 0 },
        { week: 4, current: 5, extension: 2 },
        { week: 5, current: 0, extension: 5 },
      ],
    });
  });

  it('패스가 오늘 끝나면 지금 패스는 0일, 연장분이 오늘부터', () => {
    const bar = passBar({
      startDate: '2026-10-31',
      today: '2026-10-31',
      passEnd: '2026-10-31',
      days: 7,
    });
    expect(bar.currentDays).toBe(0);
    expect(bar.currentEndsOn).toBe('10월 31일');
    expect(bar.endsOn).toBe('11월 7일');
    expect(bar.weeks).toEqual([{ week: 1, current: 0, extension: 7 }]);
  });

  it('패스가 내일 끝나면 지금 패스 1일', () => {
    const bar = passBar({
      startDate: '2026-10-31',
      today: '2026-10-31',
      passEnd: '2026-11-01',
      days: 35,
    });
    expect(bar.currentDays).toBe(1);
    expect(bar.totalDays).toBe(36);
    expect(bar.endsOn).toBe('12월 6일');
    expect(bar.weeks[0]).toEqual({ week: 1, current: 1, extension: 6 });
  });

  it('1주 연장: 연장분 7일', () => {
    const bar = passBar({
      startDate: '2026-10-31',
      today: '2026-10-31',
      passEnd: '2026-12-05',
      days: 7,
    });
    expect(bar.totalDays).toBe(42);
    expect(bar.endsOn).toBe('12월 12일');
    expect(bar.weeks.at(-1)).toEqual({ week: 5, current: 7, extension: 7 });
  });

  it('패스가 없으면 오늘부터 고른 기간만, 지금 패스 없음', () => {
    expect(
      passBar({ startDate: '2026-10-07', today: '2026-10-23', passEnd: null, days: 7 })
    ).toEqual({
      totalDays: 7,
      currentDays: 0,
      currentEndsOn: null,
      endsOn: '10월 30일',
      weeks: [
        { week: 3, current: 0, extension: 5 },
        { week: 4, current: 0, extension: 2 },
      ],
    });
  });

  it('패스 끝이 오늘보다 앞이면(이미 끝남) 패스가 없는 것처럼', () => {
    const bar = passBar({
      startDate: null,
      today: '2026-10-31',
      passEnd: '2026-10-30',
      days: 7,
    });
    expect(bar.currentDays).toBe(0);
    expect(bar.currentEndsOn).toBeNull();
  });
});
