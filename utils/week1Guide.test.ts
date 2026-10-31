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

  it('7일차 내일 예고는 2주차: 저녁 밥 없는 식사(앱 할 일의 무탄수식)와 24시간 단식 (p.16)', () => {
    const { tomorrow } = WEEK1_DAILY_GUIDE[7];
    expect(tomorrow).toContain('2주차');
    expect(tomorrow).toContain('밥이 없는');
    expect(tomorrow).toContain('무탄수식');
    expect(tomorrow).toContain('24시간');
  });

  it('책에 있는 내용을 빠뜨리지 않는다: 첫 3일 장 휴식(p.13), 4일차 두통이 낫는 것(p.20)', () => {
    const text = (day: number) => JSON.stringify(WEEK1_DAILY_GUIDE[day]);
    expect(text(1)).toContain('장을 쉬게');
    expect(text(4)).toContain('두통');
  });

  it('책에 없는 표현을 쓰지 않는다 (리뷰 지적: 일찍 자기, 적게 먹으려고)', () => {
    const all = JSON.stringify(WEEK1_DAILY_GUIDE);
    expect(all).not.toContain('일찍 자');
    expect(all).not.toContain('적게 먹으려고');
    expect(all).not.toContain('배고픔이 느껴질 수');
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
