import { describe, expect, it } from 'vitest';
import {
  INBODY_NOT_FOUND_MESSAGE,
  inbodyFill,
  interpretInbodyResponse,
  formatMonthDay,
} from './inbodyRead';

const RESULT = { weight_kg: 72.4, muscle_kg: 30.1, fat_kg: 18.6, measured_on: '2026-10-28' };
const EMPTY = { weight_kg: null, muscle_kg: null, fat_kg: null, measured_on: null };
const TEXTS = { weight: '73.0', muscle: '', fat: '' };

describe('interpretInbodyResponse', () => {
  it('200 ok + 값', () => {
    expect(interpretInbodyResponse(200, { status: 'ok', result: RESULT })).toEqual({
      status: 'ok',
      result: RESULT,
    });
  });

  it('200인데 결과 모양이 어긋나면 error', () => {
    expect(interpretInbodyResponse(200, { status: 'ok' }).status).toBe('error');
    expect(
      interpretInbodyResponse(200, { status: 'ok', result: { ...RESULT, weight_kg: '72' } }).status
    ).toBe('error');
    expect(interpretInbodyResponse(200, null).status).toBe('error');
  });

  it('429·413·400·500 안내', () => {
    expect(interpretInbodyResponse(429, { error: 'x' })).toEqual({
      status: 'quotaExceeded',
      message: '오늘 결과지 읽기를 모두 사용했어요 · 자정에 다시 채워져요',
    });
    expect(interpretInbodyResponse(413, {})).toEqual({
      status: 'tooLarge',
      message: '사진이 너무 커요. 다른 사진을 골라주세요',
    });
    expect(interpretInbodyResponse(400, { error: 'JPEG 또는 PNG 사진만 읽을 수 있어요' })).toEqual({
      status: 'invalid',
      message: 'JPEG 또는 PNG 사진만 읽을 수 있어요',
    });
    expect(interpretInbodyResponse(500, {})).toEqual({
      status: 'error',
      message: '결과지를 읽지 못했어요. 잠시 후 다시 시도해 주세요',
    });
    expect(interpretInbodyResponse(401, {}).status).toBe('error');
  });
});

describe('inbodyFill', () => {
  const base = { texts: TEXTS, targetDay: '2026-10-30', today: '2026-10-30' };

  it('읽은 값으로 세 칸을 채운다 (소수 한 자리)', () => {
    expect(inbodyFill({ ...base, result: { ...RESULT, fat_kg: 18, measured_on: null } })).toEqual({
      found: true,
      texts: { weight: '72.4', muscle: '30.1', fat: '18.0' },
      measuredDay: null,
    });
  });

  it('못 읽은 칸(null)은 원래 입력을 남긴다', () => {
    expect(
      inbodyFill({
        ...base,
        texts: { weight: '73.0', muscle: '29.0', fat: '' },
        result: { ...EMPTY, fat_kg: 20.1 },
      })
    ).toEqual({
      found: true,
      texts: { weight: '73.0', muscle: '29.0', fat: '20.1' },
      measuredDay: null,
    });
  });

  it('전부 null이면 찾지 못함 (칸은 그대로)', () => {
    expect(inbodyFill({ ...base, result: EMPTY })).toEqual({ found: false });
    // 날짜만 읽혀도 숫자가 없으면 찾지 못함
    expect(inbodyFill({ ...base, result: { ...EMPTY, measured_on: '2026-10-28' } })).toEqual({
      found: false,
    });
    expect(INBODY_NOT_FOUND_MESSAGE).toBe('결과지에서 숫자를 찾지 못했어요. 직접 입력해 주세요');
  });

  it('결과지 날짜가 저장할 날과 다르면 그 날짜를 알려 준다', () => {
    expect(inbodyFill({ ...base, result: RESULT })).toMatchObject({
      found: true,
      measuredDay: '2026-10-28',
    });
  });

  it('결과지 날짜가 저장할 날과 같거나 미래면 날짜 안내 없음', () => {
    expect(inbodyFill({ ...base, result: { ...RESULT, measured_on: '2026-10-30' } })).toMatchObject(
      { measuredDay: null }
    );
    expect(inbodyFill({ ...base, result: { ...RESULT, measured_on: '2026-10-31' } })).toMatchObject(
      { measuredDay: null }
    );
    // 지난 날 시트에서 오늘 결과지를 읽으면 오늘을 알려 준다
    expect(
      inbodyFill({
        ...base,
        targetDay: '2026-10-29',
        result: { ...RESULT, measured_on: '2026-10-30' },
      })
    ).toMatchObject({ measuredDay: '2026-10-30' });
  });
});

describe('formatMonthDay', () => {
  it('M/D', () => {
    expect(formatMonthDay('2026-10-28')).toBe('10/28');
    expect(formatMonthDay('2026-01-05')).toBe('1/5');
  });
});
