import { describe, expect, it } from 'vitest';
import {
  canSaveFastedMinutes,
  EARLY_END_WHEEL,
  earlyEndConfirmMessage,
  fastedMinutesAt,
  fastingDayOf,
  fastingHistoryLabel,
  fastingResultLabel,
  formatFastedHours,
  minutesForWheel,
} from './fastingEarlyEnd';

const start = new Date('2026-10-22T19:00:00+09:00');

describe('fastedMinutesAt', () => {
  it('시작부터 지난 분 (분 내림)', () => {
    expect(fastedMinutesAt(start, new Date('2026-10-23T11:30:59+09:00'))).toBe(990);
    expect(fastedMinutesAt(start, new Date('2026-10-23T11:00:00+09:00'))).toBe(960);
  });

  it('1분이 안 됐어도(시작 전이어도) 1분으로 본다 ("0분"으로 기록하지 않게)', () => {
    expect(fastedMinutesAt(start, new Date('2026-10-22T18:00:00+09:00'))).toBe(1);
    expect(fastedMinutesAt(start, start)).toBe(1);
    expect(fastedMinutesAt(start, new Date('2026-10-22T19:00:59+09:00'))).toBe(1);
    expect(earlyEndConfirmMessage(fastedMinutesAt(start, start))).toBe(
      '지금까지 1분 동안 단식했어요. 여기서 끝낼까요?'
    );
  });

  it('24시간(1440분)을 넘기지 않는다', () => {
    expect(fastedMinutesAt(start, new Date('2026-10-23T19:00:00+09:00'))).toBe(1440);
    expect(fastedMinutesAt(start, new Date('2026-10-24T09:00:00+09:00'))).toBe(1440);
  });
});

describe('formatFastedHours', () => {
  it('시간과 분', () => {
    expect(formatFastedHours(990)).toBe('16시간 30분');
    expect(formatFastedHours(960)).toBe('16시간');
    expect(formatFastedHours(45)).toBe('45분');
    expect(formatFastedHours(0)).toBe('0분');
  });

  it('시간이 없으면 빈 문자열', () => {
    expect(formatFastedHours(null)).toBe('');
  });
});

describe('문구', () => {
  it('진행 중 끝내기 확인', () => {
    expect(earlyEndConfirmMessage(990)).toBe(
      '지금까지 16시간 30분 동안 단식했어요. 여기서 끝낼까요?'
    );
  });

  it('결과 줄', () => {
    expect(fastingResultLabel('success', null)).toBe('성공으로 기록했어요');
    expect(fastingResultLabel('broken', 960)).toBe('16시간 하고 끝냈다고 기록했어요');
    expect(fastingResultLabel('broken', null)).toBe('일찍 끝냈다고 기록했어요');
  });

  it('기록 탭 목록', () => {
    expect(fastingHistoryLabel(null, null)).toBe('기록 안 함');
    expect(fastingHistoryLabel('success', null)).toBe('성공');
    expect(fastingHistoryLabel('broken', 960)).toBe('16시간 (일찍 끝냄)');
    expect(fastingHistoryLabel('broken', null)).toBe('일찍 끝냄');
  });
});

describe('fastingDayOf', () => {
  it('단식 시작일 KST 날짜 (자정 넘겨 시작해도 KST 기준)', () => {
    expect(fastingDayOf(start)).toBe('2026-10-22');
    expect(fastingDayOf(new Date('2026-10-22T00:30:00+09:00'))).toBe('2026-10-22');
  });
});

describe('minutesForWheel', () => {
  it('기본 16시간, 저장된 분은 10분 단위로 내려 10분~23시간 50분 안에', () => {
    expect(EARLY_END_WHEEL).toEqual({ maxHour: 23, minuteStep: 10, initial: 960, min: 10 });
    expect(minutesForWheel(null)).toBe(960);
    expect(minutesForWheel(990)).toBe(990);
    expect(minutesForWheel(995)).toBe(990);
    expect(minutesForWheel(1439)).toBe(1430);
    expect(minutesForWheel(1440)).toBe(1430);
    expect(minutesForWheel(5)).toBe(10);
    expect(minutesForWheel(0)).toBe(10);
  });
});

describe('canSaveFastedMinutes', () => {
  it('10분 이상만 저장', () => {
    expect(canSaveFastedMinutes(0)).toBe(false);
    expect(canSaveFastedMinutes(10)).toBe(true);
    expect(canSaveFastedMinutes(1430)).toBe(true);
  });
});
