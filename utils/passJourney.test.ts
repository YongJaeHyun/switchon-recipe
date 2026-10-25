import { describe, expect, it } from 'vitest';
import { passJourney } from './passJourney';

describe('passJourney', () => {
  it('3주차 3일째에 사면 3주차 5일, 4주차 7일, 유지기 23일', () => {
    // 시작일 10-07 → 10-23이 3주차 3일째
    expect(passJourney({ startDate: '2026-10-07', from: '2026-10-23' })).toEqual({
      endsOn: '11월 27일',
      segments: [
        { week: 3, days: 5 },
        { week: 4, days: 7 },
        { week: 5, days: 23 },
      ],
    });
  });

  it('1주차 첫날에 사면 1~4주차 7일씩, 유지기 7일', () => {
    expect(passJourney({ startDate: '2026-10-26', from: '2026-10-26' }).segments).toEqual([
      { week: 1, days: 7 },
      { week: 2, days: 7 },
      { week: 3, days: 7 },
      { week: 4, days: 7 },
      { week: 5, days: 7 },
    ]);
  });

  it('유지기 이후는 모두 유지기로 묶는다', () => {
    expect(passJourney({ startDate: '2026-09-01', from: '2026-10-26' }).segments).toEqual([
      { week: 5, days: 35 },
    ]);
  });

  it('시작일 전이거나 시작일이 없으면 1주차부터 센다', () => {
    expect(passJourney({ startDate: '2026-10-28', from: '2026-10-26' }).segments[0]).toEqual({
      week: 1,
      days: 9,
    });
    expect(passJourney({ startDate: null, from: '2026-10-26' }).segments[0]).toEqual({
      week: 1,
      days: 7,
    });
  });

  it('시작일에 시각이 붙어 있어도 날짜 부분으로 센다, 읽을 수 없으면 시작일이 없는 것처럼', () => {
    expect(
      passJourney({ startDate: '2026-10-07 00:00:00+00', from: '2026-10-23' }).segments[0]
    ).toEqual({ week: 3, days: 5 });
    expect(passJourney({ startDate: '', from: '2026-10-26' }).segments[0]).toEqual({
      week: 1,
      days: 7,
    });
    expect(passJourney({ startDate: 'oops', from: '2026-10-26' }).segments[0]).toEqual({
      week: 1,
      days: 7,
    });
  });

  it('달과 해를 넘기는 끝 날짜', () => {
    expect(passJourney({ startDate: null, from: '2026-12-20' }).endsOn).toBe('1월 24일');
  });
});
