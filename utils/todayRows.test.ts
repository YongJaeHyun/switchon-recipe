import { describe, expect, it } from 'vitest';
import { fastingResultQuestion, todayExtraRows, weekStepLabel } from './todayRows';

// 2026-10-22 = 목(4), 2026-10-23 = 금(5)
const thuEvening = { fastingDays: [4], schedule: { 4: 1140 } };

describe('todayExtraRows', () => {
  it('1주차는 단식 줄이 하나도 없다 (설정이 남아 있어도)', () => {
    expect(
      todayExtraRows({ week: 1, now: new Date('2026-10-23T09:00:00+09:00'), ...thuEvening })
    ).toEqual({
      fastingUpcoming: false,
      fastingProgress: false,
      fastingResultDay: null,
      fastingEndedEarlyDay: null,
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
    expect(rows.fastingUpcoming).toBe(false);
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

  it('단식 시작 전(목 오전)에는 오늘 단식 안내 줄, 진행 줄·결과 질문 없음', () => {
    const rows = todayExtraRows({
      week: 2,
      now: new Date('2026-10-22T09:00:00+09:00'),
      ...thuEvening,
    });
    expect(rows.fastingUpcoming).toBe(true);
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
          schedule: {},
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
        schedule: {},
        weekContext: { from: '2026-10-19', previous: null },
      })
    ).toEqual({
      fastingUpcoming: false,
      fastingProgress: false,
      fastingResultDay: null,
      fastingEndedEarlyDay: null,
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
      schedule: {},
      weekContext: { from: '2026-10-19', previous: { 0: 1140 } },
    });
    expect(rows.fastingResultDay).toBe('2026-10-18');
    expect(rows.fastingProgress).toBe(false);
    expect(rows.fastingDayLine).toBeNull();
  });

  it('새 주차 첫날: 지난 주 일요일 22:00 단식이 진행 중이면 진행 줄', () => {
    const rows = todayExtraRows({
      week: 3,
      now: new Date('2026-10-19T10:00:00+09:00'),
      fastingDays: [],
      schedule: {},
      weekContext: { from: '2026-10-19', previous: { 0: 1320 } },
    });
    expect(rows.fastingProgress).toBe(true);
    expect(rows.fastingResultDay).toBeNull();
  });

  it('요일마다 다른 시각: 토요일은 19시 전까지 안내 줄, 목요일(13시) 결과 질문은 열려 있다', () => {
    const rows = todayExtraRows({
      week: 3,
      now: new Date('2026-10-24T13:30:00+09:00'),
      fastingDays: [4, 6],
      schedule: { 4: 780, 6: 1140 },
    });
    expect(rows.fastingUpcoming).toBe(true);
    expect(rows.fastingProgress).toBe(false);
    expect(rows.fastingResultDay).toBe('2026-10-22');
  });
});

describe('todayExtraRows: 진행 중에 일찍 끝낸 단식', () => {
  it('지금 단식에 결과가 있으면 진행 카드 자리에 그 단식의 결과 카드 (할 일 목록에는 줄을 더하지 않음)', () => {
    const rows = todayExtraRows({
      week: 2,
      now: new Date('2026-10-23T09:00:00+09:00'),
      ...thuEvening,
      currentFastAnswered: true,
    });
    expect(rows.fastingProgress).toBe(false);
    expect(rows.fastingEndedEarlyDay).toBe('2026-10-22');
    expect(rows.fastingResultDay).toBeNull();
  });

  it('단식이 끝난 뒤에는 목록 안 결과 줄', () => {
    const rows = todayExtraRows({
      week: 2,
      now: new Date('2026-10-23T19:30:00+09:00'),
      ...thuEvening,
      currentFastAnswered: false,
    });
    expect(rows.fastingResultDay).toBe('2026-10-22');
    expect(rows.fastingEndedEarlyDay).toBeNull();
  });

  it('결과가 없으면 지금처럼 진행 줄', () => {
    const rows = todayExtraRows({
      week: 2,
      now: new Date('2026-10-23T09:00:00+09:00'),
      ...thuEvening,
      currentFastAnswered: false,
    });
    expect(rows.fastingProgress).toBe(true);
    expect(rows.fastingResultDay).toBeNull();
    expect(rows.fastingEndedEarlyDay).toBeNull();
  });

  it('단식 중이 아니면 영향 없음 (시작 전 안내 줄)', () => {
    const rows = todayExtraRows({
      week: 2,
      now: new Date('2026-10-22T09:00:00+09:00'),
      ...thuEvening,
      currentFastAnswered: true,
    });
    expect(rows.fastingUpcoming).toBe(true);
    expect(rows.fastingResultDay).toBeNull();
  });
});

describe('weekStepLabel', () => {
  it('1주차 1~3일', () => expect(weekStepLabel(1, 3)).toBe('(1 ~ 3일)'));
  it('1주차 4~7일', () => expect(weekStepLabel(1, 4)).toBe('(4 ~ 7일)'));
  it('2주차부터는 없음', () => expect(weekStepLabel(2, 1)).toBeNull());
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
