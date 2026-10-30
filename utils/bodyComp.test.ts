import { describe, expect, it } from 'vitest';
import {
  formatBodyComp,
  parseBodyCompInput,
  prefillBodyComp,
  weightUpsertPayload,
} from './bodyComp';

describe('parseBodyCompInput', () => {
  it('빈칸은 null (입력 안 함)', () => {
    expect(parseBodyCompInput('', 'muscle')).toBeNull();
    expect(parseBodyCompInput('   ', 'fat')).toBeNull();
  });

  it('소수 한 자리로 반올림', () => {
    expect(parseBodyCompInput('27.15', 'muscle')).toBe(27.2);
    expect(parseBodyCompInput('19.8', 'fat')).toBe(19.8);
    expect(parseBodyCompInput(' 30 ', 'muscle')).toBe(30);
  });

  it('쉼표 소수점도 받는다', () => {
    expect(parseBodyCompInput('27,1', 'muscle')).toBe(27.1);
    expect(parseBodyCompInput('19,8', 'fat')).toBe(19.8);
  });

  it('골격근량은 5.0~100.0만', () => {
    expect(parseBodyCompInput('5', 'muscle')).toBe(5);
    expect(parseBodyCompInput('100', 'muscle')).toBe(100);
    expect(parseBodyCompInput('4.9', 'muscle')).toBe('invalid');
    expect(parseBodyCompInput('100.1', 'muscle')).toBe('invalid');
  });

  it('체지방량은 1.0~200.0만', () => {
    expect(parseBodyCompInput('1', 'fat')).toBe(1);
    expect(parseBodyCompInput('200', 'fat')).toBe(200);
    expect(parseBodyCompInput('0.9', 'fat')).toBe('invalid');
    expect(parseBodyCompInput('200.1', 'fat')).toBe('invalid');
  });

  it('반올림한 값으로 범위를 본다 (DB도 반올림 뒤 check)', () => {
    expect(parseBodyCompInput('100.04', 'muscle')).toBe(100);
    expect(parseBodyCompInput('4.95', 'muscle')).toBe(5);
  });

  it('숫자가 아니면 invalid', () => {
    expect(parseBodyCompInput('abc', 'muscle')).toBe('invalid');
    expect(parseBodyCompInput('27.', 'muscle')).toBe('invalid');
    expect(parseBodyCompInput('-20', 'fat')).toBe('invalid');
    expect(parseBodyCompInput('1.2.3', 'fat')).toBe('invalid');
  });
});

describe('weightUpsertPayload', () => {
  const empty = { muscle_kg: null, fat_kg: null };
  const saved = { muscle_kg: 27.1, fat_kg: 19.8 };

  it('인바디를 건드리지 않으면 체중만 보낸다 (같은 날 인바디 값 보존)', () => {
    const payload = weightUpsertPayload({
      day: '2026-10-30',
      weight_kg: 64.2,
      initial: saved,
      input: saved,
    });
    expect(payload).toEqual({ day: '2026-10-30', weight_kg: 64.2 });
    expect(Object.keys(payload)).toEqual(['day', 'weight_kg']);
  });

  it('처음부터 빈칸이고 그대로 비어 있으면 키를 넣지 않는다', () => {
    const payload = weightUpsertPayload({
      day: '2026-10-30',
      weight_kg: 64.2,
      initial: empty,
      input: empty,
    });
    expect(Object.keys(payload)).toEqual(['day', 'weight_kg']);
  });

  it('새로 입력한 값은 보낸다', () => {
    expect(
      weightUpsertPayload({
        day: '2026-10-30',
        weight_kg: 64.2,
        initial: empty,
        input: saved,
      })
    ).toEqual({ day: '2026-10-30', weight_kg: 64.2, muscle_kg: 27.1, fat_kg: 19.8 });
  });

  it('한쪽만 바꾸면 그쪽만 보낸다', () => {
    expect(
      weightUpsertPayload({
        day: '2026-10-30',
        weight_kg: 64.2,
        initial: saved,
        input: { muscle_kg: 27.5, fat_kg: 19.8 },
      })
    ).toEqual({ day: '2026-10-30', weight_kg: 64.2, muscle_kg: 27.5 });
  });

  it('있던 값을 비우면 그 필드만 null로 지운다', () => {
    expect(
      weightUpsertPayload({
        day: '2026-10-30',
        weight_kg: 64.2,
        initial: saved,
        input: { muscle_kg: 27.1, fat_kg: null },
      })
    ).toEqual({ day: '2026-10-30', weight_kg: 64.2, fat_kg: null });
  });

  it('payload에 undefined 값인 키가 없다', () => {
    const cases = [
      { initial: empty, input: empty },
      { initial: saved, input: saved },
      { initial: empty, input: { muscle_kg: 30, fat_kg: null } },
      { initial: saved, input: { muscle_kg: null, fat_kg: 19.8 } },
    ];
    for (const c of cases) {
      const payload = weightUpsertPayload({ day: '2026-10-30', weight_kg: 64.2, ...c });
      expect(Object.values(payload)).not.toContain(undefined);
    }
  });
});

describe('prefillBodyComp', () => {
  const logs = [
    { day: '2026-10-29', weight_kg: 64.5, muscle_kg: 27.0, fat_kg: 20.1 },
    { day: '2026-10-30', weight_kg: 64.2, muscle_kg: 27.1, fat_kg: null },
  ];

  it('그날 기록의 값만 채운다', () => {
    expect(prefillBodyComp(logs, '2026-10-30')).toEqual({ muscle_kg: 27.1, fat_kg: null });
  });

  it('그날 기록이 없으면 전날 값을 가져오지 않고 빈칸', () => {
    expect(prefillBodyComp(logs, '2026-10-31')).toEqual({ muscle_kg: null, fat_kg: null });
  });
});

describe('formatBodyComp', () => {
  it('둘 다 있으면 가운데 점으로', () => {
    expect(formatBodyComp({ muscle_kg: 27.1, fat_kg: 19.8 })).toBe('골격근 27.1 · 체지방 19.8');
  });

  it('한쪽만 있으면 그쪽만', () => {
    expect(formatBodyComp({ muscle_kg: 27, fat_kg: null })).toBe('골격근 27.0');
    expect(formatBodyComp({ muscle_kg: null, fat_kg: 19.8 })).toBe('체지방 19.8');
  });

  it('둘 다 없으면 null', () => {
    expect(formatBodyComp({ muscle_kg: null, fat_kg: null })).toBeNull();
  });
});
