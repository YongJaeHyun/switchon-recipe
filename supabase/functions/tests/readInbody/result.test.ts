import { describe, expect, it } from 'vitest';
import {
  INBODY_RESPONSE_SCHEMA,
  buildInbodyPrompt,
  normalizeInbodyResult,
  parseInbodyResponse,
} from '../../read-inbody/result.ts';

const TODAY = '2026-10-30';
const EMPTY = { weight_kg: null, muscle_kg: null, fat_kg: null, measured_on: null };

describe('normalizeInbodyResult', () => {
  it('정상 값은 소수 한 자리로', () => {
    expect(
      normalizeInbodyResult(
        { weight_kg: 72.44, muscle_kg: 30.15, fat_kg: 18.0, measured_on: '2026-10-28' },
        TODAY
      )
    ).toEqual({ weight_kg: 72.4, muscle_kg: 30.2, fat_kg: 18, measured_on: '2026-10-28' });
  });

  it('문자열 숫자도 숫자로 바꾼다 (kg 단위·쉼표 소수점·공백 허용)', () => {
    expect(
      normalizeInbodyResult(
        { weight_kg: '72.4', muscle_kg: ' 30,1 kg', fat_kg: '18.6kg', measured_on: null },
        TODAY
      )
    ).toEqual({ weight_kg: 72.4, muscle_kg: 30.1, fat_kg: 18.6, measured_on: null });
  });

  it('숫자가 아닌 문자열·다른 타입은 null', () => {
    expect(
      normalizeInbodyResult(
        { weight_kg: '약 72', muscle_kg: true, fat_kg: '18.6%', measured_on: 20261028 },
        TODAY
      )
    ).toEqual(EMPTY);
  });

  it('범위 밖이면 그 값만 null (체중 20~300, 골격근 5~100, 체지방 1~200)', () => {
    expect(normalizeInbodyResult({ weight_kg: 19.9, muscle_kg: 4.9, fat_kg: 0.9 }, TODAY)).toEqual(
      EMPTY
    );
    expect(
      normalizeInbodyResult({ weight_kg: 300.1, muscle_kg: 100.1, fat_kg: 200.1 }, TODAY)
    ).toEqual(EMPTY);
    expect(normalizeInbodyResult({ weight_kg: 20, muscle_kg: 5, fat_kg: 1 }, TODAY)).toEqual({
      weight_kg: 20,
      muscle_kg: 5,
      fat_kg: 1,
      measured_on: null,
    });
    expect(normalizeInbodyResult({ weight_kg: 300, muscle_kg: 100, fat_kg: 200 }, TODAY)).toEqual({
      weight_kg: 300,
      muscle_kg: 100,
      fat_kg: 200,
      measured_on: null,
    });
    expect(normalizeInbodyResult({ weight_kg: 72, muscle_kg: 130 }, TODAY)).toEqual({
      ...EMPTY,
      weight_kg: 72,
    });
  });

  it('음수·무한대·NaN은 null', () => {
    expect(
      normalizeInbodyResult({ weight_kg: -72, muscle_kg: Infinity, fat_kg: NaN }, TODAY)
    ).toEqual(EMPTY);
  });

  it('날짜: yyyy-MM-dd만, 점·슬래시 구분과 한 자리 월일은 맞춰 준다', () => {
    const day = (measured_on: unknown) => normalizeInbodyResult({ measured_on }, TODAY).measured_on;
    expect(day('2026-10-28')).toBe('2026-10-28');
    expect(day('2026.10.28')).toBe('2026-10-28');
    expect(day('2026/1/5')).toBe('2026-01-05');
    expect(day('2026-10-28 08:31')).toBe('2026-10-28');
  });

  it('날짜: 없는 날짜·형식 오류·미래는 null', () => {
    const day = (measured_on: unknown) => normalizeInbodyResult({ measured_on }, TODAY).measured_on;
    expect(day('2026-02-30')).toBeNull();
    expect(day('2026-13-01')).toBeNull();
    expect(day('10/28')).toBeNull();
    expect(day('26.10.28')).toBeNull();
    expect(day('어제')).toBeNull();
    expect(day('2026-10-31')).toBeNull();
    expect(day(TODAY)).toBe(TODAY);
  });

  it('객체가 아니거나 키가 없으면 전부 null', () => {
    expect(normalizeInbodyResult(null, TODAY)).toEqual(EMPTY);
    expect(normalizeInbodyResult([], TODAY)).toEqual(EMPTY);
    expect(normalizeInbodyResult({}, TODAY)).toEqual(EMPTY);
  });
});

describe('parseInbodyResponse', () => {
  it('JSON 텍스트를 정규화한다', () => {
    expect(
      parseInbodyResponse(
        JSON.stringify({ weight_kg: 72.4, muscle_kg: 30.1, fat_kg: 18.6, measured_on: null }),
        TODAY
      )
    ).toEqual({
      status: 'ok',
      result: { weight_kg: 72.4, muscle_kg: 30.1, fat_kg: 18.6, measured_on: null },
    });
  });

  it('```json 감싸개가 붙어도 읽는다', () => {
    expect(parseInbodyResponse('```json\n{"weight_kg": 70}\n```', TODAY)).toEqual({
      status: 'ok',
      result: { ...EMPTY, weight_kg: 70 },
    });
  });

  it('결과지가 아니라 전부 null이면 ok + 전부 null', () => {
    expect(parseInbodyResponse(JSON.stringify(EMPTY), TODAY)).toEqual({
      status: 'ok',
      result: EMPTY,
    });
  });

  it('JSON이 아니거나 객체가 아니면 invalid', () => {
    expect(parseInbodyResponse('not json', TODAY)).toEqual({ status: 'invalid' });
    expect(parseInbodyResponse('[1,2]', TODAY)).toEqual({ status: 'invalid' });
    expect(parseInbodyResponse('null', TODAY)).toEqual({ status: 'invalid' });
  });
});

describe('buildInbodyPrompt / INBODY_RESPONSE_SCHEMA', () => {
  it('체지방량은 kg 칸, 체지방률(%)과 헷갈리지 않게 적는다', () => {
    const prompt = buildInbodyPrompt();
    expect(prompt).toContain('체성분분석');
    expect(prompt).toContain('골격근·지방분석');
    expect(prompt).toContain('체지방률');
    expect(prompt).toContain('yyyy-MM-dd');
  });

  it('네 필드 모두 nullable, 필수', () => {
    expect(INBODY_RESPONSE_SCHEMA.required).toEqual([
      'weight_kg',
      'muscle_kg',
      'fat_kg',
      'measured_on',
    ]);
    for (const key of INBODY_RESPONSE_SCHEMA.required) {
      expect(INBODY_RESPONSE_SCHEMA.properties[key].nullable).toBe(true);
    }
  });
});
