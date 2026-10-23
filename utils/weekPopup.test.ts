import { describe, expect, it } from 'vitest';
import { shouldOpenWeekPopup } from './weekPopup';

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
