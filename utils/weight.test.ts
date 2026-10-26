import { describe, expect, it } from 'vitest';
import { getWeekColorHex } from './getWeekColor';
import {
  chartPoints,
  formatWeightDiff,
  parseWeightInput,
  prefillWeight,
  shiftDay,
  pointerWeight,
  shouldAskWeightReminder,
  weekOfDay,
  weightChange,
} from './weight';

describe('parseWeightInput', () => {
  it('소수점 둘째 자리는 반올림해 한 자리로', () => {
    expect(parseWeightInput('65.25')).toBe(65.3);
    expect(parseWeightInput('65.05')).toBe(65.1);
    expect(parseWeightInput('65.24')).toBe(65.2);
  });

  it('정수·한 자리 소수는 그대로', () => {
    expect(parseWeightInput('65')).toBe(65);
    expect(parseWeightInput('65.5')).toBe(65.5);
    expect(parseWeightInput(' 70.0 ')).toBe(70);
  });

  it('쉼표 소수점도 받는다', () => {
    expect(parseWeightInput('65,5')).toBe(65.5);
  });

  it('범위(20.0~300.0) 밖은 null', () => {
    expect(parseWeightInput('6.5')).toBeNull();
    expect(parseWeightInput('650')).toBeNull();
    expect(parseWeightInput('19.9')).toBeNull();
    expect(parseWeightInput('300.04')).toBe(300);
    expect(parseWeightInput('300.1')).toBeNull();
    expect(parseWeightInput('20')).toBe(20);
  });

  it('빈 값·숫자 아님은 null', () => {
    expect(parseWeightInput('')).toBeNull();
    expect(parseWeightInput('   ')).toBeNull();
    expect(parseWeightInput('abc')).toBeNull();
    expect(parseWeightInput('65.')).toBeNull();
    expect(parseWeightInput('6.5.5')).toBeNull();
    expect(parseWeightInput('-65')).toBeNull();
  });
});

const logs = [
  { day: '2026-10-12', weight_kg: 70.4 }, // 시작일 이전
  { day: '2026-10-20', weight_kg: 68.9 },
  { day: '2026-10-15', weight_kg: 70.0 }, // 시작일
  { day: '2026-10-22', weight_kg: 68.5 }, // 8일째 = 2주차
];

describe('weightChange', () => {
  it('시작일 이전 기록은 빼고 처음·마지막을 비교한다', () => {
    expect(weightChange(logs, '2026-10-15')).toEqual({ first: 70.0, last: 68.5, diff: -1.5 });
  });

  it('allPeriod면 이전 기록도 포함한다', () => {
    expect(weightChange(logs, '2026-10-15', { allPeriod: true })).toEqual({
      first: 70.4,
      last: 68.5,
      diff: -1.9,
    });
  });

  it('시작일이 없으면 전체 기록', () => {
    expect(weightChange(logs, null)?.first).toBe(70.4);
  });

  it('기록 0개 → null', () => {
    expect(weightChange([], '2026-10-15')).toBeNull();
    expect(weightChange([{ day: '2026-10-01', weight_kg: 60 }], '2026-10-15')).toBeNull();
  });

  it('기록 1개면 변화 0', () => {
    expect(weightChange([{ day: '2026-10-16', weight_kg: 60 }], '2026-10-15')).toEqual({
      first: 60,
      last: 60,
      diff: 0,
    });
  });

  it('부동소수 오차 없이 한 자리로', () => {
    const r = weightChange(
      [
        { day: '2026-10-15', weight_kg: 70.1 },
        { day: '2026-10-16', weight_kg: 70.3 },
      ],
      '2026-10-15'
    );
    expect(r?.diff).toBe(0.2);
  });
});

describe('weekOfDay', () => {
  it('시작일 = 1주차, 8일째 = 2주차, 이전 = 0 이하', () => {
    expect(weekOfDay('2026-10-15', '2026-10-15')).toBe(1);
    expect(weekOfDay('2026-10-21', '2026-10-15')).toBe(1);
    expect(weekOfDay('2026-10-22', '2026-10-15')).toBe(2);
    expect(weekOfDay('2026-10-14', '2026-10-15')).toBeLessThanOrEqual(0);
  });
});

describe('chartPoints', () => {
  it('날짜순, 시작일 이후만, 주차별 색', () => {
    expect(chartPoints(logs, '2026-10-15')).toEqual([
      { value: 70.0, label: '10/15', dataPointColor: getWeekColorHex(1) },
      { value: 68.9, label: '10/20', dataPointColor: getWeekColorHex(1) },
      { value: 68.5, label: '10/22', dataPointColor: getWeekColorHex(2) },
    ]);
  });

  it('allPeriod면 이전 기록은 회색 점으로 포함', () => {
    const points = chartPoints(logs, '2026-10-15', { allPeriod: true });
    expect(points).toHaveLength(4);
    expect(points[0].label).toBe('10/12');
    expect(points[0].dataPointColor).not.toBe('');
    expect(points[0].dataPointColor).not.toBe(getWeekColorHex(1));
  });

  it('5주차 이후는 5주차 색', () => {
    const [p] = chartPoints([{ day: '2026-11-30', weight_kg: 66 }], '2026-10-15');
    expect(p.dataPointColor).toBe(getWeekColorHex(5));
  });
});

describe('shiftDay', () => {
  it('하루 전/후 (월·연 경계 포함)', () => {
    expect(shiftDay('2026-10-22', -1)).toBe('2026-10-21');
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('formatWeightDiff', () => {
  it('부호와 한 자리 소수', () => {
    expect(formatWeightDiff(-1.5)).toBe('-1.5kg');
    expect(formatWeightDiff(0.2)).toBe('+0.2kg');
    expect(formatWeightDiff(0)).toBe('0.0kg');
  });
});

describe('prefillWeight', () => {
  it('그날 값 → 없으면 어제 값 → 없으면 null', () => {
    expect(prefillWeight(logs, '2026-10-22')).toBe(68.5);
    expect(prefillWeight(logs, '2026-10-21')).toBe(68.9);
    expect(prefillWeight(logs, '2026-10-25')).toBeNull();
  });
});

describe('shouldAskWeightReminder', () => {
  it('설정을 불러왔고 아직 묻지 않았으면 묻는다 (행 없음 = null 포함)', () => {
    expect(
      shouldAskWeightReminder({
        isFetched: true,
        isError: false,
        setting: null,
        hadLogsBefore: false,
      })
    ).toBe(true);
    expect(
      shouldAskWeightReminder({
        isFetched: true,
        isError: false,
        setting: { weight_reminder_asked: false },
        hadLogsBefore: false,
      })
    ).toBe(true);
  });

  it('이미 물었으면 묻지 않는다', () => {
    expect(
      shouldAskWeightReminder({
        isFetched: true,
        isError: false,
        setting: { weight_reminder_asked: true },
        hadLogsBefore: false,
      })
    ).toBe(false);
  });

  it('설정 조회가 실패했거나 아직이면 묻지 않는다 (다른 기기에서 이미 답했을 수 있다)', () => {
    expect(
      shouldAskWeightReminder({
        isFetched: true,
        isError: true,
        setting: undefined,
        hadLogsBefore: false,
      })
    ).toBe(false);
    expect(
      shouldAskWeightReminder({
        isFetched: true,
        isError: false,
        setting: undefined,
        hadLogsBefore: false,
      })
    ).toBe(false);
    expect(
      shouldAskWeightReminder({
        isFetched: false,
        isError: false,
        setting: undefined,
        hadLogsBefore: false,
      })
    ).toBe(false);
  });

  it('처음 기록일 때만 묻는다: 저장 전에 기록이 있었거나 기록 목록을 모르면 묻지 않는다', () => {
    const base = { isFetched: true, isError: false, setting: null };
    expect(shouldAskWeightReminder({ ...base, hadLogsBefore: true })).toBe(false);
    expect(shouldAskWeightReminder({ ...base, hadLogsBefore: undefined })).toBe(false);
    expect(shouldAskWeightReminder({ ...base, hadLogsBefore: false })).toBe(true);
  });
});

describe('pointerWeight', () => {
  const points = [
    { value: 65.4, label: '10/1', dataPointColor: '#000' },
    { value: 64.9, label: '10/2', dataPointColor: '#000' },
  ];

  it('포인터 위치의 원래 체중을 돌려준다 (차트가 넘기는 yAxisOffset 뺀 값을 쓰지 않는다)', () => {
    expect(pointerWeight(points, 1)).toBe(64.9);
    expect(pointerWeight(points, 0)).toBe(65.4);
  });

  it('범위 밖이면 null', () => {
    expect(pointerWeight(points, 2)).toBeNull();
    expect(pointerWeight(points, -1)).toBeNull();
    expect(pointerWeight(points, undefined)).toBeNull();
  });
});
