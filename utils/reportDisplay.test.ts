import { describe, expect, it } from 'vitest';
import {
  formatItemRate,
  formatWeightDiff,
  groupReportsByProgram,
  isEmptyReport,
  isReportHref,
  parseReportContent,
  parseReportStats,
  shouldShowReportPreview,
  toWeeklyReport,
} from './reportDisplay';

describe('formatWeightDiff', () => {
  it('줄었으면 감량', () => expect(formatWeightDiff(-1.2)).toBe('1.2kg 감량'));
  it('늘었으면 증가', () => expect(formatWeightDiff(0.4)).toBe('0.4kg 증가'));
  it('0이면 변화 없음', () => expect(formatWeightDiff(0)).toBe('변화 없음'));
  it('null이면 -', () => expect(formatWeightDiff(null)).toBe('-'));
});

describe('formatItemRate', () => {
  it('이름 완료/등장', () =>
    expect(formatItemRate({ name: '아침 쉐이크', done: 7, appeared: 7 })).toBe('아침 쉐이크 7/7'));
});

describe('groupReportsByProgram', () => {
  const reports = [
    { start_date: '2026-09-01', week_index: 1 },
    { start_date: '2026-10-01', week_index: 1 },
    { start_date: '2026-08-01', week_index: 2 },
    { start_date: '2026-10-01', week_index: 2 },
    { start_date: '2026-09-01', week_index: 3 },
  ];

  it('지금 시작일 리포트는 current, 나머지는 시작일별 previous (최신 먼저)', () => {
    const { current, previous } = groupReportsByProgram(reports, '2026-10-01');
    expect(current.map((r) => r.week_index)).toEqual([2, 1]);
    expect(previous.map((g) => g.startDate)).toEqual(['2026-09-01', '2026-08-01']);
    expect(previous[0].reports.map((r) => r.week_index)).toEqual([3, 1]);
    expect(previous[1].reports.map((r) => r.week_index)).toEqual([2]);
  });

  it('시작일을 바꾸면 이전 리포트는 사라지지 않고 previous로 간다', () => {
    const { current, previous } = groupReportsByProgram(reports, '2026-10-20');
    expect(current).toEqual([]);
    expect(previous.flatMap((g) => g.reports)).toHaveLength(reports.length);
  });

  it('시작일에 시각이 붙어 있어도 날짜로 비교한다', () => {
    const { current } = groupReportsByProgram(reports, '2026-10-01T00:00:00+09:00');
    expect(current).toHaveLength(2);
  });

  it('시작일이 없으면 전부 previous', () => {
    const { current, previous } = groupReportsByProgram(reports, null);
    expect(current).toEqual([]);
    expect(previous).toHaveLength(3);
  });
});

describe('parseReportContent', () => {
  it('null·배열·문자열이면 null', () => {
    expect(parseReportContent(null)).toBeNull();
    expect(parseReportContent([])).toBeNull();
    expect(parseReportContent('x')).toBeNull();
  });

  it('빠진 칸은 빈 문자열, 잘못된 actionLink는 null', () => {
    expect(parseReportContent({ summary: '요약', actionLink: { meal: 'snack' } })).toEqual({
      summary: '요약',
      good: '',
      improve: '',
      action: '',
      actionLink: null,
      weightNote: '',
      nextWeek: '',
    });
  });

  it('정상 값은 그대로', () => {
    const content = {
      summary: 's',
      good: 'g',
      improve: 'i',
      action: 'a',
      actionLink: { meal: 'lunch' },
      weightNote: 'w',
      nextWeek: '한 줄\n두 줄',
    };
    expect(parseReportContent(content)).toEqual(content);
  });
});

describe('parseReportStats', () => {
  it('객체가 아니거나 기간이 없으면 null', () => {
    expect(parseReportStats(null)).toBeNull();
    expect(parseReportStats({ weekIndex: 1 })).toBeNull();
  });

  it('빠진 값은 0/null로 채운다', () => {
    const stats = parseReportStats({ range: { from: '2026-10-01', to: '2026-10-07' } });
    expect(stats?.weight).toEqual({
      start: null,
      end: null,
      diff: null,
      daysLogged: 0,
      totalDiff: null,
    });
    expect(stats?.todo.items).toEqual([]);
    expect(stats?.fasting.planned).toBe(0);
  });
});

describe('toWeeklyReport', () => {
  it('empty 행의 content null을 견딘다', () => {
    const report = toWeeklyReport({
      start_date: '2026-10-01',
      week_index: 1,
      status: 'empty',
      stats: {},
      content: null,
      created_at: '2026-10-08T00:00:00Z',
    });
    expect(report.content).toBeNull();
    expect(report.stats).toBeNull();
    expect(isEmptyReport(report)).toBe(true);
  });
});

describe('shouldShowReportPreview', () => {
  const sales = (onSale: boolean) => ({
    onSale,
    freeActive: false,
    tier: null,
    productId: null,
    priceKrw: null,
    freeDaysLeft: 0,
    nextTier: null,
  });
  const status = (hasAccess: boolean, onSale: boolean) => ({
    sales: sales(onSale),
    passExpiresAt: null,
    hasAccess,
    serverNow: '2026-10-22T00:00:00Z',
  });

  it('무료 유저 + 판매 중이면 보인다', () =>
    expect(shouldShowReportPreview(status(false, true), true)).toBe(true));
  it('판매 안 하면 숨긴다', () => {
    expect(shouldShowReportPreview(status(false, false), true)).toBe(false);
    expect(shouldShowReportPreview(status(false, true), false)).toBe(false);
  });
  it('권한이 있거나 상태를 모르면 숨긴다', () => {
    expect(shouldShowReportPreview(status(true, true), true)).toBe(false);
    expect(shouldShowReportPreview(undefined, true)).toBe(false);
  });
});

describe('isEmptyReport', () => {
  const stats = parseReportStats({ range: { from: '2026-10-01', to: '2026-10-07' } });
  it('ready인데 문장만 없으면 숫자는 보여준다', () =>
    expect(isEmptyReport({ status: 'ready', stats, content: null })).toBe(false));
  it('ready인데 문장도 숫자도 없으면 빈 주로 본다', () =>
    expect(isEmptyReport({ status: 'ready', stats: null, content: null })).toBe(true));
});

describe('isReportHref', () => {
  it('리포트 알림 경로만 true', () => {
    expect(isReportHref('/report/2026-10-01/2')).toBe(true);
    expect(isReportHref('/(inquiry)')).toBe(false);
    expect(isReportHref(undefined)).toBe(false);
  });
});
