import { describe, expect, it } from 'vitest';
import {
  basisLabel,
  formatPremiumRemaining,
  PREMIUM_QUOTA_EXCEEDED_MESSAGE,
  foodCheckLevel,
  foodCheckLevelLabel,
} from './foodCheckDisplay';

describe('foodCheckLevel', () => {
  it('7~10점은 ok, 4~6점은 caution, 1~3점은 avoid', () => {
    expect(foodCheckLevel({ score: 10, verdict: 'ok' })).toBe('ok');
    expect(foodCheckLevel({ score: 7, verdict: 'ok' })).toBe('ok');
    expect(foodCheckLevel({ score: 6, verdict: 'ok' })).toBe('caution');
    expect(foodCheckLevel({ score: 4, verdict: 'avoid' })).toBe('caution');
    expect(foodCheckLevel({ score: 3, verdict: 'avoid' })).toBe('avoid');
    expect(foodCheckLevel({ score: 1, verdict: 'avoid' })).toBe('avoid');
  });

  it('점수가 없으면 verdict로 (ok/avoid), 둘 다 없으면 null', () => {
    expect(foodCheckLevel({ score: null, verdict: 'ok' })).toBe('ok');
    expect(foodCheckLevel({ score: null, verdict: 'avoid' })).toBe('avoid');
    expect(foodCheckLevel({ score: null, verdict: null })).toBeNull();
  });
});

describe('foodCheckLevelLabel', () => {
  it('세 단계 문구', () => {
    expect(foodCheckLevelLabel('ok')).toBe('먹어도 돼요');
    expect(foodCheckLevelLabel('caution')).toBe('주의가 필요해요');
    expect(foodCheckLevelLabel('avoid')).toBe('피하는 게 좋아요');
    expect(foodCheckLevelLabel(null)).toBe('');
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
