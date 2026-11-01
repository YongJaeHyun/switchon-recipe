import { describe, expect, it } from 'vitest';
import {
  passBadgeA11yLabel,
  passBadgeLabel,
  passBadgeState,
  passGiftBannerText,
  passLockedBannerText,
  passTrialBannerText,
} from './passFeatureLabel';

describe('passBadgeState', () => {
  it('패스가 있으면 체험 상태와 관계없이 pass', () => {
    expect(passBadgeState(true)).toEqual({ kind: 'pass' });
    expect(passBadgeState(true, { kind: 'trial', remaining: 2 })).toEqual({ kind: 'pass' });
  });

  it('패스 없이 무료 체험이 남았으면 trial', () => {
    expect(passBadgeState(false, { kind: 'trial', remaining: 2 })).toEqual({
      kind: 'trial',
      remaining: 2,
    });
  });

  it('패스도 체험도 없으면 locked (체험이 없는 기능 포함)', () => {
    expect(passBadgeState(false)).toEqual({ kind: 'locked' });
    expect(passBadgeState(false, { kind: 'locked' })).toEqual({ kind: 'locked' });
    expect(passBadgeState(false, { kind: 'open' })).toEqual({ kind: 'locked' });
  });

  it('남은 횟수가 0 이하면 trial이 아니라 locked', () => {
    expect(passBadgeState(false, { kind: 'trial', remaining: 0 })).toEqual({ kind: 'locked' });
  });
});

describe('passBadgeLabel', () => {
  it('패스·잠금은 "패스"', () => {
    expect(passBadgeLabel({ kind: 'pass' })).toBe('패스');
    expect(passBadgeLabel({ kind: 'locked' })).toBe('패스');
  });

  it('무료 체험은 남은 횟수를 붙인다', () => {
    expect(passBadgeLabel({ kind: 'trial', remaining: 3 })).toBe('패스 · 무료 체험 3번 남음');
    expect(passBadgeLabel({ kind: 'trial', remaining: 1 })).toBe('패스 · 무료 체험 1번 남음');
  });
});

describe('passBadgeA11yLabel', () => {
  it('상태를 말로 읽어 준다', () => {
    expect(passBadgeA11yLabel({ kind: 'pass' })).toBe('스위치온 패스 기능');
    expect(passBadgeA11yLabel({ kind: 'trial', remaining: 2 })).toBe(
      '스위치온 패스 기능, 무료 체험 2번 남음'
    );
    expect(passBadgeA11yLabel({ kind: 'locked' })).toBe('스위치온 패스 기능, 패스가 필요해요');
  });
});

describe('passTrialBannerText', () => {
  it('2번 이상 남았으면 남은 횟수', () => {
    expect(passTrialBannerText(3)).toEqual({
      title: '스위치온 패스 기능을 무료로 써 보고 있어요',
      detail: '남은 무료 체험 3번',
    });
  });

  it('1번 남았으면 마지막 체험 안내', () => {
    expect(passTrialBannerText(1).detail).toBe('이번이 마지막 무료 체험이에요');
  });
});

describe('passGiftBannerText', () => {
  it('한 번 받은 무료 리포트용 문구', () => {
    expect(passGiftBannerText()).toEqual({
      title: '스위치온 패스 기능을 무료로 받아 봤어요',
      detail: '무료 리포트는 한 번만 드려요',
    });
  });
});

describe('passLockedBannerText', () => {
  it('패스가 필요한 기능 화면: 제목은 같고 설명은 화면마다', () => {
    expect(passLockedBannerText('조건은 미리 골라 볼 수 있어요')).toEqual({
      title: '스위치온 패스 기능이에요',
      detail: '조건은 미리 골라 볼 수 있어요',
    });
  });
});
