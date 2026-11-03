import { describe, expect, it } from 'vitest';
import {
  appendGoalHistory,
  goalCelebrationTexts,
  goalCardTexts,
  goalFromRow,
  goalHistoryEntryToAdd,
  goalHistoryFromJson,
  goalMarks,
  goalInputTexts,
  goalProgress,
  inbodyGoalLines,
  latestWeight,
  parseGoalInputs,
  shouldAskGoalAfterSave,
} from './weightGoal';

const log = (
  day: string,
  weight_kg: number,
  body?: { muscle_kg?: number | null; fat_kg?: number | null }
) => ({ day, weight_kg, muscle_kg: body?.muscle_kg ?? null, fat_kg: body?.fat_kg ?? null });

const period = { startDate: '2026-10-20', programStart: '2026-10-20' };

describe('goalFromRow', () => {
  it('행이 없거나 열이 없으면 목표 없음', () => {
    expect(goalFromRow(null)).toEqual({
      weight_goal_kg: null,
      muscle_goal_kg: null,
      fat_goal_kg: null,
      history: [],
    });
    expect(goalFromRow({})).toEqual({
      weight_goal_kg: null,
      muscle_goal_kg: null,
      fat_goal_kg: null,
      history: [],
    });
  });

  it('숫자 문자열(numeric)도 숫자로', () => {
    expect(
      goalFromRow({ weight_goal_kg: '72.0', muscle_goal_kg: 27.1, fat_goal_kg: null } as never)
    ).toEqual({ weight_goal_kg: 72, muscle_goal_kg: 27.1, fat_goal_kg: null, history: [] });
  });
});

describe('goalHistoryFromJson', () => {
  it('모양이 맞는 항목만 남기고 날짜순', () => {
    expect(
      goalHistoryFromJson([
        { goal_kg: 70, reached_on: '2026-11-20', reached_kg: 69.8 },
        { goal_kg: '72.0', reached_on: '2026-11-01', reached_kg: '71.5' },
        { goal_kg: 'x', reached_on: '2026-11-02', reached_kg: 71 },
        { goal_kg: 71, reached_on: 3, reached_kg: 71 },
        null,
        'text',
      ])
    ).toEqual([
      { goal_kg: 72, reached_on: '2026-11-01', reached_kg: 71.5 },
      { goal_kg: 70, reached_on: '2026-11-20', reached_kg: 69.8 },
    ]);
  });

  it('배열이 아니면 빈 목록', () => {
    expect(goalHistoryFromJson(null)).toEqual([]);
    expect(goalHistoryFromJson({})).toEqual([]);
  });
});

describe('parseGoalInputs (체중·인바디 입력 규칙 재사용)', () => {
  it('목표 체중만 적으면 인바디 목표는 null', () => {
    expect(parseGoalInputs({ weight: '72', muscle: '', fat: '' })).toEqual({
      goal: { weight_goal_kg: 72, muscle_goal_kg: null, fat_goal_kg: null },
      errors: { weight: false, muscle: false, fat: false },
      notLower: false,
    });
  });

  it('소수점 한 자리로 반올림, 쉼표도 받는다', () => {
    expect(parseGoalInputs({ weight: '71,55', muscle: '27.14', fat: '17' }).goal).toEqual({
      weight_goal_kg: 71.6,
      muscle_goal_kg: 27.1,
      fat_goal_kg: 17,
    });
  });

  it('목표 체중은 필수, 범위 밖이면 오류', () => {
    expect(parseGoalInputs({ weight: '', muscle: '', fat: '' })).toEqual({
      goal: null,
      errors: { weight: true, muscle: false, fat: false },
      notLower: false,
    });
    expect(parseGoalInputs({ weight: '19.9', muscle: '', fat: '' }).errors.weight).toBe(true);
    expect(parseGoalInputs({ weight: '300.1', muscle: '', fat: '' }).errors.weight).toBe(true);
  });

  it('인바디 목표가 범위 밖이면 그 칸만 오류', () => {
    expect(parseGoalInputs({ weight: '72', muscle: '4', fat: 'abc' })).toEqual({
      goal: null,
      errors: { weight: false, muscle: true, fat: true },
      notLower: false,
    });
  });

  it('목표는 지금 체중보다 낮아야 한다 (같거나 높으면 저장하지 않음)', () => {
    expect(parseGoalInputs({ weight: '72', muscle: '', fat: '' }, 78)).toMatchObject({
      goal: { weight_goal_kg: 72 },
      notLower: false,
    });
    expect(parseGoalInputs({ weight: '78', muscle: '', fat: '' }, 78)).toEqual({
      goal: null,
      errors: { weight: true, muscle: false, fat: false },
      notLower: true,
    });
    expect(parseGoalInputs({ weight: '80', muscle: '', fat: '' }, 78).notLower).toBe(true);
  });

  it('지금 체중을 모르면 범위만 본다, 범위 밖이면 범위 오류가 먼저', () => {
    expect(parseGoalInputs({ weight: '80', muscle: '', fat: '' }, null).goal).not.toBeNull();
    expect(parseGoalInputs({ weight: '310', muscle: '', fat: '' }, 78)).toMatchObject({
      errors: { weight: true },
      notLower: false,
    });
  });
});

describe('latestWeight', () => {
  it('날짜가 가장 늦은 기록의 체중, 없으면 null', () => {
    expect(latestWeight([log('2026-11-01', 78), log('2026-10-31', 80)])).toBe(78);
    expect(latestWeight([])).toBeNull();
  });
});

describe('goalInputTexts', () => {
  it('기존 목표로 칸을 채운다', () => {
    expect(goalInputTexts({ weight_goal_kg: 72, muscle_goal_kg: null, fat_goal_kg: 17.5 })).toEqual(
      { weight: '72.0', muscle: '', fat: '17.5' }
    );
  });
});

describe('goalProgress', () => {
  it('시작 = 프로그램 시작일 이후 첫 기록, 지금 = 마지막 기록', () => {
    const logs = [log('2026-10-10', 82), log('2026-10-21', 80), log('2026-10-25', 78)];
    expect(goalProgress(logs, 72, period)).toEqual({
      goal: 72,
      start: 80,
      current: 78,
      remaining: 6,
      percent: 25,
      reached: false,
      recorded: false,
    });
  });

  it('목표보다 내려가면 닿음, 진행률은 100에서 자른다', () => {
    const logs = [log('2026-10-21', 80), log('2026-10-30', 71.5)];
    expect(goalProgress(logs, 72, period)).toMatchObject({
      remaining: 0,
      percent: 100,
      reached: true,
    });
  });

  it('목표와 같아도 닿음', () => {
    const logs = [log('2026-10-21', 80), log('2026-10-30', 72)];
    expect(goalProgress(logs, 72, period)?.reached).toBe(true);
  });

  it('시작보다 늘면 진행률 0', () => {
    const logs = [log('2026-10-21', 80), log('2026-10-30', 81)];
    expect(goalProgress(logs, 72, period)).toMatchObject({ remaining: 9, percent: 0 });
  });

  it('시작이 목표 이하여도 나누지 않는다: 닿기 전 0, 닿으면 100', () => {
    const history = [{ goal_kg: 75, reached_on: '2026-10-25', reached_kg: 71 }];
    const logs = [log('2026-10-21', 80), log('2026-10-25', 71), log('2026-10-30', 74)];
    expect(goalProgress(logs, 72, { ...period, history })).toMatchObject({
      start: 71,
      remaining: 2,
      percent: 0,
    });
  });

  it('부동소수 오차 없이 소수 한 자리', () => {
    const logs = [log('2026-10-21', 80.3), log('2026-10-30', 78.1)];
    expect(goalProgress(logs, 72.2, period)?.remaining).toBe(5.9);
  });

  it('기간 안 기록이 없거나 목표가 없으면 null', () => {
    expect(goalProgress([log('2026-10-10', 80)], 72, period)).toBeNull();
    expect(goalProgress([log('2026-10-21', 80)], null, period)).toBeNull();
  });

  it('새 목표의 시작 = 직전 목표에 닿은 기록의 체중', () => {
    const logs = [log('2026-10-21', 80), log('2026-10-30', 71.5), log('2026-11-05', 70.5)];
    const history = [{ goal_kg: 72, reached_on: '2026-10-30', reached_kg: 71.5 }];
    expect(goalProgress(logs, 68, { ...period, history })).toMatchObject({
      start: 71.5,
      current: 70.5,
      remaining: 2.5,
      percent: 29,
      reached: false,
      recorded: false,
    });
  });

  it('닿음은 지금 체중으로만: 기록에 있어도 다시 올라가면 닿지 않음. 시작은 그 전 달성 지점', () => {
    const logs = [log('2026-10-21', 80), log('2026-10-30', 71.5), log('2026-11-10', 69.9)];
    const history = [
      { goal_kg: 72, reached_on: '2026-10-30', reached_kg: 71.5 },
      { goal_kg: 70, reached_on: '2026-11-10', reached_kg: 69.9 },
    ];
    const bounced = [...logs, log('2026-11-12', 70.4)];
    expect(goalProgress(bounced, 70, { ...period, history })).toMatchObject({
      start: 71.5,
      current: 70.4,
      reached: false,
      recorded: true,
    });
  });

  it('예전에 닿은 목표로 되돌리면 기록에 있음 (다시 축하하지 않음), 시작은 그 목표 전 지점', () => {
    const history = [
      { goal_kg: 72, reached_on: '2026-10-30', reached_kg: 71.5 },
      { goal_kg: 70, reached_on: '2026-11-10', reached_kg: 69.9 },
    ];
    const logs = [log('2026-10-21', 80), log('2026-11-10', 69.9), log('2026-11-15', 73)];
    expect(goalProgress(logs, 72, { ...period, history })).toMatchObject({
      start: 80,
      current: 73,
      reached: false,
      recorded: true,
    });
  });

  it('지난 프로그램에서 닿은 목표는 시작으로 쓰지 않는다', () => {
    const logs = [log('2026-10-21', 80), log('2026-10-25', 78)];
    const history = [{ goal_kg: 75, reached_on: '2026-09-01', reached_kg: 74.8 }];
    expect(goalProgress(logs, 72, { ...period, history })?.start).toBe(80);
  });
});

describe('goalCardTexts', () => {
  it('가는 중', () => {
    const p = goalProgress([log('2026-10-21', 80), log('2026-10-25', 78)], 72, period);
    expect(goalCardTexts(72, p)).toEqual({
      title: '목표 72.0kg까지',
      headline: '6.0kg 남았어요',
      detail: '시작 80.0kg → 지금 78.0kg · 25% 왔어요',
    });
  });

  it('닿음', () => {
    const p = goalProgress([log('2026-10-21', 80), log('2026-10-30', 71.5)], 72, period);
    expect(goalCardTexts(72, p)).toEqual({
      title: null,
      headline: '목표 72.0kg에 닿았어요 🎉',
      detail: '시작 80.0kg → 지금 71.5kg · 8.5kg 줄었어요',
    });
  });

  it('기록이 없으면 기록 안내', () => {
    expect(goalCardTexts(72, null)).toEqual({
      title: '목표 72.0kg',
      headline: '체중을 기록하면 남은 kg을 보여 드려요',
      detail: null,
    });
  });
});

describe('inbodyGoalLines', () => {
  const goal = (muscle: number | null, fat: number | null) => ({
    weight_goal_kg: 72,
    muscle_goal_kg: muscle,
    fat_goal_kg: fat,
  });

  it('인바디 기록이 없으면 줄 없음', () => {
    expect(inbodyGoalLines([log('2026-10-21', 80)], goal(27, 17), period)).toEqual([]);
  });

  it('골격근량 목표 이상이면 유지 중, 체지방량은 남은 kg', () => {
    const logs = [log('2026-10-21', 80, { muscle_kg: 27.1, fat_kg: 19.8 })];
    expect(inbodyGoalLines(logs, goal(27, 17), period)).toEqual([
      '골격근량 27.1kg · 목표 이상 유지 중',
      '체지방량 19.8kg · 목표 17.0kg까지 2.8kg',
    ]);
  });

  it('골격근량 목표에 못 미치면 남은 kg, 체지방량 목표 이하면 닿음', () => {
    const logs = [log('2026-10-21', 80, { muscle_kg: 26.5, fat_kg: 16.9 })];
    expect(inbodyGoalLines(logs, goal(27, 17), period)).toEqual([
      '골격근량 26.5kg · 목표 27.0kg까지 0.5kg',
      '체지방량 16.9kg · 목표에 닿았어요',
    ]);
  });

  it('골격근량 목표를 비우면 "시작할 때보다 줄지 않기" (기간 안 첫 인바디 기준)', () => {
    const keep = [
      log('2026-10-21', 80, { muscle_kg: 27.0 }),
      log('2026-10-28', 79, { muscle_kg: 27.2 }),
    ];
    expect(inbodyGoalLines(keep, goal(null, null), period)).toEqual([
      '골격근량 27.2kg · 시작 때보다 줄지 않고 유지 중',
    ]);
    const lost = [
      log('2026-10-21', 80, { muscle_kg: 27.0 }),
      log('2026-10-28', 79, { muscle_kg: 26.4 }),
    ];
    expect(inbodyGoalLines(lost, goal(null, null), period)).toEqual([
      '골격근량 26.4kg · 시작 때보다 0.6kg 줄었어요',
    ]);
  });

  it('체지방량 목표가 없으면 체지방량 줄은 없다. 값은 가장 최근 인바디 기록', () => {
    const logs = [
      log('2026-10-21', 80, { muscle_kg: 27.0, fat_kg: 20 }),
      log('2026-10-25', 79),
      log('2026-10-28', 79, { fat_kg: 19 }),
    ];
    expect(inbodyGoalLines(logs, goal(27, null), period)).toEqual([
      '골격근량 27.0kg · 목표 이상 유지 중',
    ]);
  });

  it('프로그램 시작 전 인바디는 보지 않는다', () => {
    const logs = [log('2026-10-10', 80, { muscle_kg: 27.0, fat_kg: 20 })];
    expect(inbodyGoalLines(logs, goal(27, 17), period)).toEqual([]);
  });
});

describe('shouldAskGoalAfterSave', () => {
  const base = { hadLogsBefore: false, goalStatus: 'none' as const, skipped: false };

  it('처음 기록이고 목표가 없으면 묻는다', () => {
    expect(shouldAskGoalAfterSave(base)).toBe(true);
  });

  it('기록이 있었거나 모르면 묻지 않는다', () => {
    expect(shouldAskGoalAfterSave({ ...base, hadLogsBefore: true })).toBe(false);
    expect(shouldAskGoalAfterSave({ ...base, hadLogsBefore: undefined })).toBe(false);
  });

  it('목표가 있거나 목표를 못 읽었으면 묻지 않는다', () => {
    expect(shouldAskGoalAfterSave({ ...base, goalStatus: 'set' })).toBe(false);
    expect(shouldAskGoalAfterSave({ ...base, goalStatus: 'unknown' })).toBe(false);
  });

  it('이 기기에서 건너뛴 적이 있으면 다시 묻지 않는다', () => {
    expect(shouldAskGoalAfterSave({ ...base, skipped: true })).toBe(false);
  });
});

describe('달성 기록 (축하 1회 판정)', () => {
  const reachedLogs = [log('2026-10-21', 80), log('2026-10-30', 71.5)];

  it('감량 목표에 닿았고 기록에 없으면 마지막 기록으로 추가할 항목', () => {
    const p = goalProgress(reachedLogs, 72, period);
    expect(goalHistoryEntryToAdd(p, '2026-10-30')).toEqual({
      goal_kg: 72,
      reached_on: '2026-10-30',
      reached_kg: 71.5,
    });
  });

  it('이미 기록에 있으면(달성 유지) 추가하지 않는다', () => {
    const history = [{ goal_kg: 72, reached_on: '2026-10-30', reached_kg: 71.5 }];
    const p = goalProgress(reachedLogs, 72, { ...period, history });
    expect(goalHistoryEntryToAdd(p, '2026-10-30')).toBeNull();
  });

  it('닿지 않았거나 기록 없음이면 null', () => {
    const notYet = goalProgress([log('2026-10-21', 80), log('2026-10-30', 75)], 72, period);
    expect(goalHistoryEntryToAdd(notYet, '2026-10-30')).toBeNull();
    expect(goalHistoryEntryToAdd(null, null)).toBeNull();
  });

  it('같은 목표값·같은 날은 두 번 넣지 않는다, 다른 건 날짜순으로 붙인다', () => {
    const a = { goal_kg: 72, reached_on: '2026-10-30', reached_kg: 71.5 };
    const b = { goal_kg: 70, reached_on: '2026-11-10', reached_kg: 69.9 };
    expect(appendGoalHistory([a], { ...a, reached_kg: 71.4 })).toEqual([a]);
    expect(appendGoalHistory([b], a)).toEqual([a, b]);
  });
});

describe('goalMarks (그래프 달성 표시)', () => {
  it('닿은 날마다 "✓ 72kg 달성", 소수가 있으면 소수까지', () => {
    expect(
      goalMarks([
        { goal_kg: 72, reached_on: '2026-10-30', reached_kg: 71.5 },
        { goal_kg: 69.5, reached_on: '2026-11-10', reached_kg: 69.4 },
      ])
    ).toEqual({ '2026-10-30': '✓ 72kg 달성', '2026-11-10': '✓ 69.5kg 달성' });
  });

  it('같은 날 여러 목표면 가장 낮은 목표', () => {
    expect(
      goalMarks([
        { goal_kg: 72, reached_on: '2026-10-30', reached_kg: 69.9 },
        { goal_kg: 70, reached_on: '2026-10-30', reached_kg: 69.9 },
      ])
    ).toEqual({ '2026-10-30': '✓ 70kg 달성' });
  });
});

describe('goalCelebrationTexts', () => {
  it('닿은 목표와 시작부터 줄어든 kg', () => {
    expect(
      goalCelebrationTexts({ goal_kg: 72, reached_on: '2026-10-30', reached_kg: 71.5 }, 80)
    ).toEqual({ title: '목표 72.0kg에 닿았어요!', message: '시작 80.0kg에서 8.5kg 줄었어요' });
  });
});
