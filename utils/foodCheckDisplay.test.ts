import { describe, expect, it } from 'vitest';
import {
  basisLabel,
  formatPremiumRemaining,
  PREMIUM_QUOTA_EXCEEDED_MESSAGE,
  verdictLabel,
} from './foodCheckDisplay';

describe('verdictLabel', () => {
  it('ok는 괜찮아요', () => {
    expect(verdictLabel('ok')).toBe('괜찮아요');
  });

  it('avoid는 피하세요', () => {
    expect(verdictLabel('avoid')).toBe('피하세요');
  });

  it('판정이 없으면 빈 문자열', () => {
    expect(verdictLabel(null)).toBe('');
  });
});

describe('basisLabel', () => {
  it('estimate는 추정', () => {
    expect(basisLabel('estimate')).toBe('추정');
  });

  it('label은 성분표 기준', () => {
    expect(basisLabel('label')).toBe('성분표 기준');
  });

  it('근거가 없으면 빈 문자열', () => {
    expect(basisLabel(null)).toBe('');
  });
});

describe('formatPremiumRemaining', () => {
  it('남은 횟수/한도를 보여준다', () => {
    expect(formatPremiumRemaining({ remaining: 27, limit: 30 })).toBe('오늘 판정 27/30회 남았어요');
  });

  it('1회 남았을 때', () => {
    expect(formatPremiumRemaining({ remaining: 1, limit: 30 })).toBe('오늘 판정 1/30회 남았어요');
  });

  it('0이면 소진 문구', () => {
    expect(formatPremiumRemaining({ remaining: 0, limit: 30 })).toBe(
      '오늘 판정을 모두 사용했어요 · 자정에 다시 채워져요'
    );
  });

  it('소진 문구는 서버 429 문구와 같다', () => {
    expect(PREMIUM_QUOTA_EXCEEDED_MESSAGE).toBe(
      '오늘 판정을 모두 사용했어요 · 자정에 다시 채워져요'
    );
  });
});
