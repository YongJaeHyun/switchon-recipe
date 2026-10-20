import { describe, expect, it } from 'vitest';
import { programWeekOf } from '../../_shared/week.ts';

// KST 2026-10-20 00:00 = 2026-10-19T15:00Z
const kst = (iso: string) => new Date(iso);

describe('programWeekOf', () => {
  it('시작일이 없으면 1주차', () => {
    expect(programWeekOf(null, kst('2026-10-20T03:00:00Z'))).toBe(1);
    expect(programWeekOf(undefined, kst('2026-10-20T03:00:00Z'))).toBe(1);
    expect(programWeekOf('', kst('2026-10-20T03:00:00Z'))).toBe(1);
  });

  it('시작일 당일은 1주차, 7일 뒤는 2주차', () => {
    expect(programWeekOf('2026-10-20', kst('2026-10-20T03:00:00Z'))).toBe(1);
    expect(programWeekOf('2026-10-20', kst('2026-10-26T14:59:59Z'))).toBe(1);
    expect(programWeekOf('2026-10-20', kst('2026-10-26T15:00:00Z'))).toBe(2);
    expect(programWeekOf('2026-10-01', kst('2026-10-29T03:00:00Z'))).toBe(5);
  });

  it('하루 경계는 KST 자정 (UTC 15:00)', () => {
    // UTC로는 아직 10/26이지만 KST로는 10/27 → 7일 경과 → 2주차
    expect(programWeekOf('2026-10-20', kst('2026-10-26T15:00:01Z'))).toBe(2);
    // UTC 날짜가 10/27이어도 KST가 10/27이면 같은 결과
    expect(programWeekOf('2026-10-20', kst('2026-10-27T00:00:00Z'))).toBe(2);
    // KST 10/26 23:59 → 6일 경과 → 1주차
    expect(programWeekOf('2026-10-20', kst('2026-10-26T14:59:00Z'))).toBe(1);
  });

  it('시작일이 미래거나 형식이 잘못되면 1주차', () => {
    expect(programWeekOf('2026-11-01', kst('2026-10-20T03:00:00Z'))).toBe(1);
    expect(programWeekOf('not-a-date', kst('2026-10-20T03:00:00Z'))).toBe(1);
  });
});
