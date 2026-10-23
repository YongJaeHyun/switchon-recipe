import { describe, expect, it } from 'vitest';
import { fastingResultRecord, fastingResultUpsertRow } from './fastingResultRecord';

describe('fastingResultRecord', () => {
  it('일찍 끝냄은 분을 함께 읽는다', () => {
    expect(fastingResultRecord({ result: 'broken', fasted_minutes: 990 })).toEqual({
      result: 'broken',
      fastedMinutes: 990,
    });
  });

  it('옛 기록(분 없음)·숫자가 아닌 값은 null', () => {
    expect(
      fastingResultRecord({ result: 'broken', fasted_minutes: null }).fastedMinutes
    ).toBeNull();
    expect(fastingResultRecord({ result: 'broken' }).fastedMinutes).toBeNull();
    expect(
      fastingResultRecord({ result: 'broken', fasted_minutes: '990' as unknown as number })
        .fastedMinutes
    ).toBeNull();
  });

  it('성공이면 분이 남아 있어도 null', () => {
    expect(fastingResultRecord({ result: 'success', fasted_minutes: 990 })).toEqual({
      result: 'success',
      fastedMinutes: null,
    });
  });
});

describe('fastingResultUpsertRow', () => {
  const now = new Date('2026-10-23T09:00:00Z');
  const base = { uid: 'u1', day: '2026-10-22', now };

  it('일찍 끝냄은 분을 저장한다', () => {
    expect(fastingResultUpsertRow({ ...base, result: 'broken', fastedMinutes: 960 })).toEqual({
      uid: 'u1',
      day: '2026-10-22',
      result: 'broken',
      fasted_minutes: 960,
      updated_at: '2026-10-23T09:00:00.000Z',
    });
  });

  it('성공이면 분을 지운다 (일찍 끝냄 → 성공으로 바꿀 때)', () => {
    expect(
      fastingResultUpsertRow({ ...base, result: 'success', fastedMinutes: 960 }).fasted_minutes
    ).toBeNull();
    expect(fastingResultUpsertRow({ ...base, result: 'success' }).fasted_minutes).toBeNull();
  });

  it('일찍 끝냄인데 분이 없으면 null', () => {
    expect(fastingResultUpsertRow({ ...base, result: 'broken' }).fasted_minutes).toBeNull();
  });
});
