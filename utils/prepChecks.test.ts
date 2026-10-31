import { describe, expect, it } from 'vitest';
import { EMPTY_PREP, prepChecksFor, setPrepCheck } from './prepChecks';

describe('prepChecksFor', () => {
  it('같은 시작일의 체크만 돌려준다', () => {
    const prep = { startDate: '2026-10-31', checks: { rules: true } };
    expect(prepChecksFor(prep, '2026-10-31')).toEqual({ rules: true });
  });

  it('시작일이 바뀌면 예전 체크는 보이지 않는다', () => {
    const prep = { startDate: '2026-10-31', checks: { rules: true } };
    expect(prepChecksFor(prep, '2026-11-05')).toEqual({});
    expect(prepChecksFor(prep, null)).toEqual({});
  });

  it('시작일 뒤 시각은 무시하고 날짜로 비교', () => {
    const prep = { startDate: '2026-10-31', checks: { shake: true } };
    expect(prepChecksFor(prep, '2026-10-31T00:00:00')).toEqual({ shake: true });
  });
});

describe('setPrepCheck', () => {
  it('같은 시작일이면 기존 체크에 더한다', () => {
    const prep = { startDate: '2026-10-31', checks: { rules: true } };
    expect(setPrepCheck(prep, '2026-10-31', 'shake', true)).toEqual({
      startDate: '2026-10-31',
      checks: { rules: true, shake: true },
    });
  });

  it('시작일이 바뀌었으면 예전 체크를 버리고 새로 시작', () => {
    const prep = { startDate: '2026-10-31', checks: { rules: true } };
    expect(setPrepCheck(prep, '2026-11-05', 'shake', true)).toEqual({
      startDate: '2026-11-05',
      checks: { shake: true },
    });
  });

  it('빈 상태에서 체크를 끄고 켤 수 있다', () => {
    const on = setPrepCheck(EMPTY_PREP, '2026-10-31', 'rules', true);
    expect(prepChecksFor(on, '2026-10-31')).toEqual({ rules: true });
    const off = setPrepCheck(on, '2026-10-31', 'rules', false);
    expect(prepChecksFor(off, '2026-10-31')).toEqual({ rules: false });
  });
});
