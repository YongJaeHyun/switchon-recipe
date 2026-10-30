import { describe, expect, it } from 'vitest';
import { prefillBodyComp, weightUpsertPayload } from './bodyComp';
import {
  dayLogTexts,
  formatMonthDay,
  INBODY_NOT_FOUND_MESSAGE,
  inbodyFill,
  inbodyTextsForDay,
  interpretInbodyResponse,
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

  it('402는 패스 필요 (locked)', () => {
    expect(interpretInbodyResponse(402, { error: '패스가 필요한 기능입니다.' })).toEqual({
      status: 'locked',
    });
  });
});

describe('inbodyFill', () => {
  const base = { texts: TEXTS, targetDay: '2026-10-30', today: '2026-10-30' };

  it('읽은 값으로 세 칸을 채운다 (소수 한 자리)', () => {
    expect(inbodyFill({ ...base, result: { ...RESULT, fat_kg: 18, measured_on: null } })).toEqual({
      found: true,
      texts: { weight: '72.4', muscle: '30.1', fat: '18.0' },
      measuredDay: null,
      measuredDayOld: false,
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
      measuredDayOld: false,
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
      measuredDayOld: false,
    });
  });

  it('결과지 날짜가 오늘보다 7일 넘게 지났으면 오래됨 (기본을 오늘로)', () => {
    const at = (measured_on: string) => inbodyFill({ ...base, result: { ...RESULT, measured_on } });
    expect(at('2026-10-23')).toMatchObject({ measuredDay: '2026-10-23', measuredDayOld: false });
    expect(at('2026-10-22')).toMatchObject({ measuredDay: '2026-10-22', measuredDayOld: true });
    expect(at('2025-03-01')).toMatchObject({ measuredDay: '2025-03-01', measuredDayOld: true });
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

describe('dayLogTexts', () => {
  const logs = [
    { day: '2026-10-28', weight_kg: 73, muscle_kg: 29.5, fat_kg: null },
    { day: '2026-10-30', weight_kg: 72, muscle_kg: 30, fat_kg: 20 },
  ];

  it('그날 기록 값만 (전날 체중을 끌어오지 않는다)', () => {
    expect(dayLogTexts(logs, '2026-10-28')).toEqual({ weight: '73.0', muscle: '29.5', fat: '' });
    expect(dayLogTexts(logs, '2026-10-29')).toEqual({ weight: '', muscle: '', fat: '' });
  });
});

describe('inbodyTextsForDay', () => {
  it('읽은 칸은 읽은 값, 못 읽은 칸은 그 저장 날의 값', () => {
    expect(
      inbodyTextsForDay({
        result: { ...RESULT, fat_kg: null },
        base: { weight: '73.0', muscle: '29.5', fat: '19.0' },
      })
    ).toEqual({ texts: { weight: '72.4', muscle: '30.1', fat: '19.0' }, weightMissing: false });
  });

  it('체중을 못 읽었고 그날 체중 기록도 없으면 weightMissing', () => {
    expect(
      inbodyTextsForDay({
        result: { ...RESULT, weight_kg: null },
        base: { weight: '', muscle: '', fat: '' },
      })
    ).toEqual({ texts: { weight: '', muscle: '30.1', fat: '18.6' }, weightMissing: true });
  });

  it('리뷰 예시: 오늘 체지방 20.0이 결과지 날짜(10/28) 저장에 섞이지 않는다', () => {
    const logs = [{ day: '2026-10-30', weight_kg: 72, muscle_kg: 30, fat_kg: 20 }];
    const result = { weight_kg: 72.4, muscle_kg: 30.1, fat_kg: null, measured_on: '2026-10-28' };
    const { texts, weightMissing } = inbodyTextsForDay({
      result,
      base: dayLogTexts(logs, '2026-10-28'),
    });
    expect(texts).toEqual({ weight: '72.4', muscle: '30.1', fat: '' });
    expect(weightMissing).toBe(false);
    // 시트가 저장할 payload: 10/28에 체지방 키가 없다 (20.0이 들어가지 않음)
    expect(
      weightUpsertPayload({
        day: '2026-10-28',
        weight_kg: 72.4,
        initial: prefillBodyComp(logs, '2026-10-28'),
        input: { muscle_kg: 30.1, fat_kg: null },
      })
    ).toEqual({ day: '2026-10-28', weight_kg: 72.4, muscle_kg: 30.1 });
  });
});
