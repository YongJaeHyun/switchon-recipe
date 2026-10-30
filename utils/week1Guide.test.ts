import { WEEK1_DAILY_GUIDE } from 'const/week1Guide';
import { describe, expect, it } from 'vitest';
import { isWeek1GuideDismissed, week1GuideFor } from './week1Guide';

describe('week1GuideFor', () => {
  it('1주차 1~7일은 그날 안내', () => {
    for (let day = 1; day <= 7; day++) {
      expect(week1GuideFor(1, day)).toBe(WEEK1_DAILY_GUIDE[day]);
    }
  });

  it('1주차 밖이면 null', () => {
    expect(week1GuideFor(2, 1)).toBeNull();
    expect(week1GuideFor(4, 3)).toBeNull();
    expect(week1GuideFor(0, 1)).toBeNull();
    expect(week1GuideFor(-1, 7)).toBeNull();
  });

  it('일차가 1~7이 아니면 null (시작 전 일차 0 포함)', () => {
    expect(week1GuideFor(1, 0)).toBeNull();
    expect(week1GuideFor(1, 8)).toBeNull();
    expect(week1GuideFor(1, -2)).toBeNull();
    expect(week1GuideFor(1, 1.5)).toBeNull();
  });
});

describe('WEEK1_DAILY_GUIDE 문구', () => {
  it('7일 모두 한 줄·팁·내일 예고가 있다', () => {
    for (let day = 1; day <= 7; day++) {
      const guide = WEEK1_DAILY_GUIDE[day];
      expect(guide.line.length).toBeGreaterThan(0);
      expect(guide.line.length).toBeLessThanOrEqual(40);
      expect(guide.tomorrow.length).toBeGreaterThan(0);
      expect(guide.tip.title.length).toBeGreaterThan(0);
      expect(guide.tip.points.length).toBeGreaterThan(0);
    }
  });

  it('4일차는 점심 저탄수식 시작, 3일차 내일 예고도 같은 내용', () => {
    expect(WEEK1_DAILY_GUIDE[4].line).toContain('저탄수식');
    expect(WEEK1_DAILY_GUIDE[3].tomorrow).toContain('저탄수식');
  });

  it('7일차 내일 예고는 2주차', () => {
    expect(WEEK1_DAILY_GUIDE[7].tomorrow).toContain('2주차');
  });
});

describe('isWeek1GuideDismissed', () => {
  it('오늘 닫았으면 숨김', () => {
    expect(isWeek1GuideDismissed('2026-10-30', '2026-10-30')).toBe(true);
  });

  it('어제 닫은 건 오늘 다시 보임', () => {
    expect(isWeek1GuideDismissed('2026-10-29', '2026-10-30')).toBe(false);
  });

  it('닫은 적 없으면 보임', () => {
    expect(isWeek1GuideDismissed(null, '2026-10-30')).toBe(false);
  });
});
