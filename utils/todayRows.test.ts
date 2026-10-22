import { describe, expect, it } from 'vitest';
import { fastingDayText, fastingResultQuestion, todayExtraRows } from './todayRows';

// 2026-10-22 = 목(4), 2026-10-23 = 금(5)
const thuEvening = { fastingDays: [4], startTime: '저녁 식후' as const };

describe('todayExtraRows', () => {
  it('1주차는 단식 줄이 하나도 없다 (설정이 남아 있어도)', () => {
    expect(
      todayExtraRows({ week: 1, now: new Date('2026-10-23T09:00:00+09:00'), ...thuEvening })
    ).toEqual({
      fastingProgress: false,
      fastingResultDay: null,
      weight: true,
      fastingDayLine: null,
    });
  });

  it('2주차, 목 저녁 식후 단식 중(금 오전)이면 진행 줄, 결과 질문 없음', () => {
    const rows = todayExtraRows({
      week: 2,
      now: new Date('2026-10-23T09:00:00+09:00'),
      ...thuEvening,
    });
    expect(rows.fastingProgress).toBe(true);
    expect(rows.fastingResultDay).toBeNull();
    expect(rows.fastingDayLine).toBe('set');
  });

  it('2주차, 단식이 끝난 뒤(금 19:30)면 진행 줄 없고 목요일 결과 질문', () => {
    const rows = todayExtraRows({
      week: 2,
      now: new Date('2026-10-23T19:30:00+09:00'),
      ...thuEvening,
    });
    expect(rows.fastingProgress).toBe(false);
    expect(rows.fastingResultDay).toBe('2026-10-22');
  });

  it('단식 시작 전(목 오전)에는 진행 줄도 결과 질문도 없다', () => {
    const rows = todayExtraRows({
      week: 2,
      now: new Date('2026-10-22T09:00:00+09:00'),
      ...thuEvening,
    });
    expect(rows.fastingProgress).toBe(false);
    expect(rows.fastingResultDay).toBeNull();
  });

  it('2~4주차 단식 요일 미설정이면 설정 안내', () => {
    for (const week of [2, 3, 4]) {
      expect(
        todayExtraRows({
          week,
          now: new Date('2026-10-23T09:00:00+09:00'),
          fastingDays: [],
          startTime: null,
        }).fastingDayLine
      ).toBe('unset');
    }
  });

  it('2주차 단식 요일 설정됨이면 set', () => {
    expect(
      todayExtraRows({ week: 2, now: new Date('2026-10-20T09:00:00+09:00'), ...thuEvening })
        .fastingDayLine
    ).toBe('set');
  });

  it('유지기(5주차) 설정 없음: 진행 줄·요일 줄 없음, 결과 질문도 없음', () => {
    expect(
      todayExtraRows({
        week: 5,
        now: new Date('2026-10-23T09:00:00+09:00'),
        fastingDays: [],
        startTime: null,
        weekContext: { from: '2026-10-19', previous: null },
      })
    ).toEqual({
      fastingProgress: false,
      fastingResultDay: null,
      weight: true,
      fastingDayLine: null,
    });
  });

  it('유지기 첫날: 4주차 마지막 단식 결과는 지금처럼 묻는다 (요일 줄은 없음)', () => {
    // 5주차 첫날 = 월 2026-10-19, 4주차 계획 일(0) 저녁 식후 → 일 19시 시작, 월 19시 끝
    const rows = todayExtraRows({
      week: 5,
      now: new Date('2026-10-19T21:00:00+09:00'),
      fastingDays: [],
      startTime: null,
      weekContext: { from: '2026-10-19', previous: { days: [0], startTime: '저녁 식후' } },
    });
    expect(rows.fastingResultDay).toBe('2026-10-18');
    expect(rows.fastingProgress).toBe(false);
    expect(rows.fastingDayLine).toBeNull();
  });
});

describe('fastingResultQuestion', () => {
  it('어제 시작한 단식이면 "어제 단식 어땠나요?"', () => {
    expect(fastingResultQuestion('2026-10-22', new Date('2026-10-23T19:30:00+09:00'))).toBe(
      '어제 단식 어땠나요?'
    );
  });
  it('그 전이면 날짜로', () => {
    expect(fastingResultQuestion('2026-10-21', new Date('2026-10-23T19:30:00+09:00'))).toBe(
      '10월 21일 단식 어땠나요?'
    );
  });
  it('KST 자정 직후에도 KST 날짜 기준', () => {
    // KST 10-23 00:30 = UTC 10-22 15:30 → 어제 = 10-22
    expect(fastingResultQuestion('2026-10-22', new Date('2026-10-22T15:30:00Z'))).toBe(
      '어제 단식 어땠나요?'
    );
  });
});

describe('fastingDayText', () => {
  it('요일 + 시작 시간', () => expect(fastingDayText([4], '저녁 식후')).toBe('목 저녁 식후'));
  it('여러 요일은 & 로', () =>
    expect(fastingDayText([2, 5], '점심 식후')).toBe('화 & 금 점심 식후'));
});
