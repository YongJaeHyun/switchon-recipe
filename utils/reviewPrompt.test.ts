import { describe, expect, it } from 'vitest';
import {
  canAskReview,
  REVIEW_COOLDOWN_DAYS,
  type ReviewAskState,
  shouldAskAfterSave,
} from './reviewPrompt';

const NOW = new Date('2026-11-20T03:00:00Z'); // KST 2026-11-20 12:00
const DAY_MS = 24 * 60 * 60 * 1000;

const base: ReviewAskState = {
  now: NOW,
  lastAskedAt: null,
  askedThisSession: false,
  failedThisSession: false,
  firstSeenDay: '2026-11-01',
  programWeek: 2,
  programDay: 3,
  jobPhase: 'idle',
  otherModalOpen: false,
};

describe('canAskReview', () => {
  it('처음이고 막는 일이 없으면 묻는다', () => {
    expect(canAskReview(base)).toBe(true);
  });

  it('30일 안에 물었으면 묻지 않는다', () => {
    const lastAskedAt = new Date(NOW.getTime() - (REVIEW_COOLDOWN_DAYS * DAY_MS - 1)).toISOString();
    expect(canAskReview({ ...base, lastAskedAt })).toBe(false);
  });

  it('30일이 지났으면 다시 묻는다', () => {
    const lastAskedAt = new Date(NOW.getTime() - REVIEW_COOLDOWN_DAYS * DAY_MS).toISOString();
    expect(canAskReview({ ...base, lastAskedAt })).toBe(true);
  });

  it('저장된 시각이 깨졌으면 물은 적 없는 것으로 본다', () => {
    expect(canAskReview({ ...base, lastAskedAt: 'garbage' })).toBe(true);
  });

  it('이번 실행에서 이미 물었으면 묻지 않는다', () => {
    expect(canAskReview({ ...base, askedThisSession: true })).toBe(false);
  });

  it('이번 실행에서 실패(한도 초과·결제 오류 등)가 있었으면 묻지 않는다', () => {
    expect(canAskReview({ ...base, failedThisSession: true })).toBe(false);
  });

  it('앱을 처음 쓴 날에는 묻지 않는다', () => {
    expect(canAskReview({ ...base, firstSeenDay: '2026-11-20' })).toBe(false);
  });

  it('처음 쓴 날을 아직 모르면 묻지 않는다', () => {
    expect(canAskReview({ ...base, firstSeenDay: null })).toBe(false);
  });

  it('프로그램 첫날(1주차 1일)에는 묻지 않는다', () => {
    expect(canAskReview({ ...base, programWeek: 1, programDay: 1 })).toBe(false);
    expect(canAskReview({ ...base, programWeek: 1, programDay: 2 })).toBe(true);
  });

  it.each(['running', 'error', 'quota', 'rejected', 'locked'] as const)(
    '레시피 만들기가 %s이면 묻지 않는다',
    (jobPhase) => {
      expect(canAskReview({ ...base, jobPhase })).toBe(false);
    }
  );

  it('레시피가 완성된 띠(done)는 막지 않는다', () => {
    expect(canAskReview({ ...base, jobPhase: 'done' })).toBe(true);
  });

  it('다른 창이 떠 있으면 묻지 않는다', () => {
    expect(canAskReview({ ...base, otherModalOpen: true })).toBe(false);
  });
});

describe('shouldAskAfterSave', () => {
  it('저장에 성공해 3개가 된 때만', () => {
    expect(shouldAskAfterSave({ saved: true, count: 3 })).toBe(true);
    expect(shouldAskAfterSave({ saved: true, count: 2 })).toBe(false);
    expect(shouldAskAfterSave({ saved: true, count: 4 })).toBe(false);
  });

  it('저장이 실패했거나(이미 저장됨 포함) 개수를 모르면 묻지 않는다', () => {
    expect(shouldAskAfterSave({ saved: false, count: 3 })).toBe(false);
    expect(shouldAskAfterSave({ saved: true, count: null })).toBe(false);
  });
});
