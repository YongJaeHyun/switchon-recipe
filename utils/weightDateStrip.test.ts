import { describe, expect, it } from 'vitest';
import {
  carryEditedTexts,
  kstDayOf,
  weightDateChips,
  weightDateRange,
  weightSheetSubtitle,
  weightStripScrollX,
  weightTargetForDay,
} from './weightDateStrip';

describe('kstDayOf', () => {
  it('UTC 15시 전은 같은 날, 15시부터는 KST 다음 날', () => {
    expect(kstDayOf(new Date('2026-10-30T14:59:59Z'))).toBe('2026-10-30');
    expect(kstDayOf(new Date('2026-10-30T15:00:00Z'))).toBe('2026-10-31');
  });

  it('월말·연말 경계', () => {
    expect(kstDayOf(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
    expect(kstDayOf(new Date('2026-02-28T15:30:00Z'))).toBe('2026-03-01');
  });
});

describe('weightDateRange', () => {
  const today = '2026-10-31';

  it('회차 시작 7일 전부터 오늘까지', () => {
    expect(
      weightDateRange({
        today,
        programStart: '2026-10-12',
        startDate: '2026-10-19',
        targetDay: today,
      })
    ).toEqual({ from: '2026-10-05', to: today });
  });

  it('회차 시작일이 없으면 시작일 기준 (programStartOf 규칙)', () => {
    expect(
      weightDateRange({
        today,
        programStart: null,
        startDate: '2026-10-19T00:00:00',
        targetDay: today,
      })
    ).toEqual({ from: '2026-10-12', to: today });
  });

  it('시작일이 아예 없으면 최근 30일 (오늘 포함)', () => {
    expect(
      weightDateRange({ today, programStart: null, startDate: null, targetDay: today })
    ).toEqual({ from: '2026-10-02', to: today });
  });

  it('시작일이 먼 미래여도 오늘은 들어간다', () => {
    expect(
      weightDateRange({ today, programStart: null, startDate: '2026-11-20', targetDay: today })
    ).toEqual({ from: today, to: today });
  });

  it('범위보다 앞선 날을 열면(전체 기간 기록) 그날부터', () => {
    expect(
      weightDateRange({
        today,
        programStart: null,
        startDate: '2026-10-19',
        targetDay: '2026-09-01',
      })
    ).toEqual({ from: '2026-09-01', to: today });
  });

  it('미래 날짜는 넣지 않는다', () => {
    expect(
      weightDateRange({
        today,
        programStart: null,
        startDate: '2026-10-19',
        targetDay: '2026-11-02',
      })
    ).toEqual({ from: '2026-10-12', to: today });
  });
});

describe('weightDateChips', () => {
  const logs = [
    { day: '2026-10-27', weight_kg: 65 },
    { day: '2026-10-29', weight_kg: 64.8 },
  ];

  it('오래된 날부터 오늘까지, 요일·기록·선택·오늘', () => {
    const chips = weightDateChips({
      range: { from: '2026-10-26', to: '2026-10-31' },
      today: '2026-10-31',
      logs,
      selectedDay: '2026-10-28',
    });
    expect(chips.map((c) => c.day)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ]);
    expect(chips.map((c) => c.weekday)).toEqual(['월', '화', '수', '목', '금', '토']);
    expect(chips.map((c) => c.recorded)).toEqual([false, true, false, true, false, false]);
    expect(chips.map((c) => c.selected)).toEqual([false, false, true, false, false, false]);
    expect(chips[5].isToday).toBe(true);
    expect(chips[0].monthDay).toBe('10/26');
  });

  it('읽기 이름: 날짜·요일·기록 여부, 오늘이면 오늘', () => {
    const chips = weightDateChips({
      range: { from: '2026-10-27', to: '2026-10-31' },
      today: '2026-10-31',
      logs,
      selectedDay: '2026-10-31',
    });
    expect(chips[0].label).toBe('10월 27일 화요일, 기록 있음');
    expect(chips[1].label).toBe('10월 28일 수요일, 기록 없음');
    expect(chips[4].label).toBe('오늘, 10월 31일 토요일, 기록 없음');
  });

  it('범위가 뒤집혀 있으면 빈 목록', () => {
    expect(
      weightDateChips({
        range: { from: '2026-11-01', to: '2026-10-31' },
        today: '2026-10-31',
        logs: [],
        selectedDay: null,
      })
    ).toEqual([]);
  });
});

describe('weightTargetForDay', () => {
  const logs = [
    { day: '2026-10-27', weight_kg: 65, muscle_kg: 27.1, fat_kg: 19.8 },
    { day: '2026-10-28', weight_kg: 64.6, muscle_kg: null, fat_kg: null },
  ];

  it('그날 체중·인바디', () => {
    expect(weightTargetForDay(logs, '2026-10-27', '2026-10-31')).toEqual({
      day: '2026-10-27',
      initial: 65,
      initialBodyComp: { muscle_kg: 27.1, fat_kg: 19.8 },
      isToday: false,
    });
  });

  it('그날 기록이 없으면 체중은 전날 값, 인바디는 비움', () => {
    expect(weightTargetForDay(logs, '2026-10-29', '2026-10-29')).toEqual({
      day: '2026-10-29',
      initial: 64.6,
      initialBodyComp: { muscle_kg: null, fat_kg: null },
      isToday: true,
    });
  });
});

describe('weightSheetSubtitle', () => {
  it('오늘이면 "오늘 10월 31일"', () => {
    expect(weightSheetSubtitle('2026-10-31', '2026-10-31')).toBe(
      '오늘 10월 31일 체중을 적어 주세요'
    );
  });

  it('지난 날은 요일까지', () => {
    expect(weightSheetSubtitle('2026-10-28', '2026-10-31')).toBe(
      '10월 28일 (수) 체중을 적어 주세요'
    );
  });
});

describe('weightStripScrollX', () => {
  it('고른 칸이 오른쪽 끝에 보이게', () => {
    // 칸 폭 60, 화면 300: 10번째(index 9) 칸 오른쪽 끝 600 → 300
    expect(weightStripScrollX({ index: 9, itemWidth: 60, viewportWidth: 300 })).toBe(300);
  });

  it('앞쪽이면 0', () => {
    expect(weightStripScrollX({ index: 2, itemWidth: 60, viewportWidth: 300 })).toBe(0);
  });

  it('고른 칸이 없으면 맨 끝(오늘) 쪽', () => {
    expect(weightStripScrollX({ index: -1, itemWidth: 60, viewportWidth: 300, count: 10 })).toBe(
      300
    );
  });
});

describe('carryEditedTexts', () => {
  const base = { weight: '65.0', muscle: '27.1', fat: '' };
  const next = { weight: '66.2', muscle: '', fat: '19.8' };

  it('아무것도 안 고쳤으면 고른 날 값으로 채운다', () => {
    expect(carryEditedTexts({ current: base, base, next })).toEqual(next);
  });

  it('적던 칸은 그대로 가져가고, 안 고친 칸만 고른 날 값으로', () => {
    expect(
      carryEditedTexts({ current: { weight: '64.5', muscle: '27.1', fat: '' }, base, next })
    ).toEqual({ weight: '64.5', muscle: '', fat: '19.8' });
  });

  it('지운 칸도 고친 것으로 본다', () => {
    expect(
      carryEditedTexts({ current: { weight: '65.0', muscle: '', fat: '' }, base, next })
    ).toEqual({ weight: '66.2', muscle: '', fat: '19.8' });
  });
});
