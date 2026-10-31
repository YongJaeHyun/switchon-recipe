import { describe, expect, it } from 'vitest';
import {
  interpretGenerateMyReport,
  missingReportWeeks,
  ON_DEMAND_MESSAGES,
  weekHasRecords,
} from './reportOnDemand';

const r = (start_date: string, week_index: number) => ({ start_date, week_index });
// 2026-10-16(금) 12:00 KST
const NOON = new Date('2026-10-16T03:00:00Z');

describe('missingReportWeeks (기록 탭: 지금 회차의 끝난 주 중 리포트 없는 주)', () => {
  it('지금 시작일 기준 오늘 전에 끝난 주 중 리포트가 없는 주를 최근 먼저', () => {
    expect(missingReportWeeks('2026-10-01', [], NOON)).toEqual([
      { weekIndex: 2, range: { from: '2026-10-08', to: '2026-10-14' } },
      { weekIndex: 1, range: { from: '2026-10-01', to: '2026-10-07' } },
    ]);
    expect(missingReportWeeks('2026-10-01', [r('2026-10-01', 1)], NOON)).toEqual([
      { weekIndex: 2, range: { from: '2026-10-08', to: '2026-10-14' } },
    ]);
  });

  it('키가 달라도 4일 이상 겹치는 리포트가 있으면 그 주는 있는 것으로 본다 (한 주 더 하기)', () => {
    // 옛 (09-24, 2) = 10-01~10-07
    expect(
      missingReportWeeks('2026-10-01', [r('2026-09-24', 2)], NOON).map((w) => w.weekIndex)
    ).toEqual([2]);
  });

  it('리포트는 5주차(유지기 1주차)까지만', () => {
    const now = new Date('2026-11-20T03:00:00Z'); // 10-01 시작 51일째
    expect(missingReportWeeks('2026-10-01', [], now).map((w) => w.weekIndex)).toEqual([
      5, 4, 3, 2, 1,
    ]);
  });

  it('1주차 중·시작 전·시작일 모름이면 없다', () => {
    expect(missingReportWeeks('2026-10-10', [], NOON)).toEqual([]);
    expect(missingReportWeeks('2026-10-20', [], NOON)).toEqual([]);
    expect(missingReportWeeks(null, [], NOON)).toEqual([]);
    expect(missingReportWeeks('2026-10', [], NOON)).toEqual([]);
  });

  it('방금 끝난 주는 08:00 리포트가 나오기 전(다음 날 09:00 KST 전)엔 보이지 않는다', () => {
    // 2주차 10-08~10-14, 10-15 08:30 KST
    const before = new Date('2026-10-14T23:30:00Z');
    expect(missingReportWeeks('2026-10-01', [], before).map((w) => w.weekIndex)).toEqual([1]);
    const after = new Date('2026-10-15T00:00:00Z'); // 09:00 KST
    expect(missingReportWeeks('2026-10-01', [], after).map((w) => w.weekIndex)).toEqual([2, 1]);
  });
});

describe('weekHasRecords', () => {
  const range = { from: '2026-10-08', to: '2026-10-14' };
  it('그 주에 체중이나 체크한 할 일이 있는 날이 있으면 true', () => {
    expect(weekHasRecords(range, ['2026-10-01', '2026-10-09'])).toBe(true);
    expect(weekHasRecords(range, ['2026-10-14'])).toBe(true);
    expect(weekHasRecords(range, ['2026-10-07', '2026-10-15'])).toBe(false);
    expect(weekHasRecords(range, [])).toBe(false);
  });
});

describe('interpretGenerateMyReport', () => {
  const row = {
    start_date: '2026-10-01',
    week_index: 2,
    display_week: 2,
    is_trial: false,
    status: 'ready',
    stats: null,
    content: null,
    created_at: '2026-10-16T03:00:00Z',
  };

  it('200이면 리포트', () => {
    const out = interpretGenerateMyReport(200, { report: row });
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.report).toMatchObject({ start_date: '2026-10-01' });
  });

  it('200인데 리포트가 없으면 error', () => {
    expect(interpretGenerateMyReport(200, {}).status).toBe('error');
  });

  it('서버 오류 코드를 화면 결과로', () => {
    expect(interpretGenerateMyReport(400, { error: 'no_records' }).status).toBe('no_records');
    expect(interpretGenerateMyReport(402, { error: 'pass_required' }).status).toBe('pass_required');
    expect(interpretGenerateMyReport(429, { error: 'daily_limit' }).status).toBe('daily_limit');
    expect(interpretGenerateMyReport(429, { error: 'already_regenerated_today' }).status).toBe(
      'regenerated_today'
    );
    expect(interpretGenerateMyReport(409, { error: 'not_changed' }).status).toBe('not_changed');
    expect(interpretGenerateMyReport(409, { error: 'not_available' }).status).toBe('not_available');
    expect(interpretGenerateMyReport(404, { error: 'not_found' }).status).toBe('not_available');
    expect(interpretGenerateMyReport(502, { error: 'generation_failed' }).status).toBe('error');
    expect(interpretGenerateMyReport(500, { error: 'internal' }).status).toBe('error');
    expect(interpretGenerateMyReport(400, 'oops').status).toBe('error');
  });

  it('결과마다 안내 문구가 있다 (해요체)', () => {
    expect(ON_DEMAND_MESSAGES.no_records).toBe('그 주 체중이나 할 일을 기록하면 만들 수 있어요');
    for (const message of Object.values(ON_DEMAND_MESSAGES)) expect(message).toMatch(/요$/);
  });
});
