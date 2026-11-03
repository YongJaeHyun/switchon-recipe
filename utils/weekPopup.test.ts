import { describe, expect, it } from 'vitest';
import { decideWeekPopup, shouldOpenWeekPopup, weekPopupKey } from './weekPopup';

describe('shouldOpenWeekPopup', () => {
  it('새 주차(2~4주차)에 들어서면 연다 — 지난 주차 팝업을 이미 봤어도', () => {
    expect(shouldOpenWeekPopup({ prevWeek: 1, week: 2, isChecked: false })).toBe(true);
    expect(shouldOpenWeekPopup({ prevWeek: 2, week: 3, isChecked: true })).toBe(true);
    expect(shouldOpenWeekPopup({ prevWeek: 3, week: 4, isChecked: true })).toBe(true);
  });

  it('유지기(5주차~)에는 열지 않는다', () => {
    expect(shouldOpenWeekPopup({ prevWeek: 4, week: 5, isChecked: true })).toBe(false);
  });

  it('같은 주차에서 이미 봤으면 열지 않는다', () => {
    expect(shouldOpenWeekPopup({ prevWeek: 3, week: 3, isChecked: true })).toBe(false);
  });

  it('같은 주차인데 아직 안 닫았으면(팝업 중 앱 종료) 다시 연다', () => {
    expect(shouldOpenWeekPopup({ prevWeek: 3, week: 3, isChecked: false })).toBe(true);
  });

  it('1주차에는 열지 않는다', () => {
    expect(shouldOpenWeekPopup({ prevWeek: 1, week: 1, isChecked: false })).toBe(false);
  });

  it('시작일을 뒤로 미뤄 주차가 줄면 열지 않는다', () => {
    expect(shouldOpenWeekPopup({ prevWeek: 3, week: 2, isChecked: true })).toBe(false);
  });
});

describe('weekPopupKey', () => {
  it('계정·프로그램 시작일·주차로 본 팝업을 구분한다', () => {
    expect(weekPopupKey('u1', '2026-10-07T00:00:00', 2)).toBe('u1:2026-10-07:2');
  });
});

describe('decideWeekPopup', () => {
  const base = {
    uid: 'u1',
    startDate: '2026-10-07',
    week: 2,
    beforeStart: false,
    seenKeys: [] as string[],
  };

  it('본 적 없는 주차면 규칙대로 연다', () => {
    expect(decideWeekPopup({ ...base, ruleOpen: true, ownerUid: 'u1', isChecked: false })).toEqual({
      open: true,
      adoptOwner: false,
      seenKey: null,
    });
  });

  it('이 계정·프로그램에서 이미 본 주차면 다시 열지 않는다 (다른 계정에 들렀다 돌아온 경우)', () => {
    expect(
      decideWeekPopup({
        ...base,
        seenKeys: ['u1:2026-10-07:2'],
        ruleOpen: true,
        ownerUid: 'u1',
        isChecked: false,
      }).open
    ).toBe(false);
  });

  it('계정이 바뀌면 기기에 남은 다른 계정의 주차와 상관없이 이 계정이 안 본 주차는 연다', () => {
    expect(
      decideWeekPopup({ ...base, ruleOpen: false, ownerUid: 'u2', isChecked: true }).open
    ).toBe(true);
  });

  it('업데이트 직후(기억한 계정 없음): 지금 계정으로 정하고, 이미 닫은 지금 주차는 본 것으로 남긴다', () => {
    expect(decideWeekPopup({ ...base, ruleOpen: false, ownerUid: null, isChecked: true })).toEqual({
      open: false,
      adoptOwner: true,
      seenKey: 'u1:2026-10-07:2',
    });
  });

  it('1주차·유지기·시작 전에는 열지 않는다', () => {
    expect(
      decideWeekPopup({ ...base, week: 1, ruleOpen: false, ownerUid: 'u2', isChecked: false }).open
    ).toBe(false);
    expect(
      decideWeekPopup({ ...base, week: 5, ruleOpen: false, ownerUid: 'u2', isChecked: false }).open
    ).toBe(false);
    expect(
      decideWeekPopup({
        ...base,
        beforeStart: true,
        ruleOpen: false,
        ownerUid: 'u2',
        isChecked: false,
      }).open
    ).toBe(false);
  });
});
