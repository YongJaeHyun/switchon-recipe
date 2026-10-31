import { describe, expect, it, vi } from 'vitest';
import type {
  NotificationRow,
  WeekData,
  WeeklyReportRow,
} from '../../_shared/weeklyReportGenerate.ts';
import {
  backfillPastReports,
  BACKFILL_DAILY_LIMIT,
  BACKFILL_MAX_REPORTS,
  type BackfillDeps,
  startReportBackfill,
} from '../../verify-pass-purchase/backfillReports.ts';

const UID = 'user-1';
const START = '2026-10-01'; // 1주차 10-01~07, 2주차 10-08~14, 3주차 ~21, 4주차 ~28, 5주차(유지기 1주차) ~11-04
// KST 날짜 day의 09:00 (UTC 00:00)
const at = (day: string) => new Date(`${day}T00:00:00Z`);

// 그 주 첫날에 체중·할 일 기록이 있는 데이터
const filledWeek = (day = START): WeekData => ({
  weights: [{ day, weight_kg: 70 }],
  todoDays: [{ day, items: ['물 2L'], checked: [0] }],
  fastingPlanDays: null,
  fastingPlanStartTime: null,
  fastingPlanStartMinutes: null,
  fastingResults: [],
  recipes: [],
  foodChecks: [],
});

const geminiOk = JSON.stringify({
  summary: '체중을 꾸준히 기록했어요',
  good: '체중을 꾸준히 기록했어요',
  improve: '물 마시기를 더 챙겨요',
  action: '점심에 물 한 잔을 더 마셔요',
  actionLink: null,
  weightNote: '기록을 이어가요',
  nextWeek: '다음 주도 기록해요',
});

interface FakeDb {
  reports: WeeklyReportRow[];
  notifications: NotificationRow[];
}

// 리포트 저장 시각 (weekly_report.created_at). 없는 행은 오래전에 만든 리포트
const createdAt = new WeakMap<WeeklyReportRow, number>();

const existingReport = (weekIndex: number, startDate = START): WeeklyReportRow =>
  ({
    uid: UID,
    start_date: startDate,
    week_index: weekIndex,
    display_week: weekIndex,
    stats: {} as WeeklyReportRow['stats'],
    content: null,
    status: 'ready',
  }) as WeeklyReportRow;

const makeDeps = (
  today: string,
  o: Partial<BackfillDeps> = {},
  db: FakeDb = { reports: [], notifications: [] }
) => {
  const deps: BackfillDeps = {
    now: () => at(today),
    fetchStartDate: vi.fn(async () => START),
    hasPremiumAccess: vi.fn(async () => true),
    fetchReportPeriods: vi.fn(async (uid: string) =>
      db.reports
        .filter((r) => r.uid === uid)
        .map((r) => ({
          start_date: r.start_date,
          week_index: r.week_index,
          display_week: r.display_week,
        }))
    ),
    fetchProgramStart: vi.fn(async () => START),
    fetchFastingPlan: vi.fn(async () => null),
    fetchWeekData: vi.fn(async (q) => filledWeek(q.range.from)),
    askGemini: vi.fn(async () => geminiOk),
    insertReport: vi.fn(async (row: WeeklyReportRow) => {
      const dup = db.reports.some(
        (r) =>
          r.uid === row.uid && r.start_date === row.start_date && r.week_index === row.week_index
      );
      if (dup) return false;
      db.reports.push(row);
      createdAt.set(row, deps.now().getTime());
      return true;
    }),
    countReportsCreatedSince: vi.fn(
      async (uid: string, since: Date) =>
        db.reports.filter((r) => r.uid === uid && (createdAt.get(r) ?? 0) >= since.getTime()).length
    ),
    insertNotification: vi.fn(async (row: NotificationRow) => {
      db.notifications.push(row);
    }),
    ...o,
  };
  return { deps, db };
};

const createdWeeks = (db: FakeDb) => db.reports.map((r) => [r.week_index, r.display_week]);

describe('backfillPastReports: 패스를 사면 지금 회차의 끝난 주 리포트를 만든다', () => {
  it('2주차에 사면 1주차 리포트를 만들고 푸시 1번', async () => {
    const { deps, db } = makeDeps('2026-10-09');
    const result = await backfillPastReports(deps, UID);

    expect(createdWeeks(db)).toEqual([[1, 1]]);
    expect(db.reports[0]).toMatchObject({ uid: UID, start_date: START, status: 'ready' });
    expect(db.notifications).toEqual([
      {
        uid: UID,
        title: '지난 1주차 리포트도 만들어 뒀어요',
        body: expect.any(String),
        href: `/report/${START}/1`,
        channel_id: 'REPORT',
        type: 'WEEKLY_REPORT',
      },
    ]);
    expect(result).toMatchObject({ created: [1], notified: true, failed: 0 });
  });

  it('4주차에 사면 1~3주차를 오래된 순으로 만들고 푸시는 1번 (목록으로 이동)', async () => {
    const { deps, db } = makeDeps('2026-10-23');
    await backfillPastReports(deps, UID);

    expect(createdWeeks(db)).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]).toMatchObject({
      title: '지난 1~3주차 리포트도 만들어 뒀어요',
      href: '/report',
    });
  });

  it('유지기 2주차 이후에 사면 유지기 1주차(5주차)까지만 보고, 한 번에 최대 4개', async () => {
    expect(BACKFILL_MAX_REPORTS).toBe(4);
    const { deps, db } = makeDeps('2026-11-12'); // 7주차
    await backfillPastReports(deps, UID);

    expect(createdWeeks(db).map(([w]) => w)).toEqual([1, 2, 3, 4]);
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0].title).toBe('지난 1~4주차 리포트도 만들어 뒀어요');
    // 6주차 이후 기간은 읽지도 않는다
    const weeks = vi.mocked(deps.fetchWeekData).mock.calls.map(([q]) => q.weekIndex);
    expect(Math.max(...weeks)).toBeLessThanOrEqual(5);
  });

  it('1~3주차 리포트가 있으면 유지기 이후에 사도 4·5주차만 만든다 (6주차 이후 없음)', async () => {
    const db: FakeDb = {
      reports: [existingReport(1), existingReport(2), existingReport(3)],
      notifications: [],
    };
    const { deps } = makeDeps('2026-11-20', {}, db); // 8주차
    await backfillPastReports(deps, UID);

    expect(createdWeeks(db).map(([w]) => w)).toEqual([1, 2, 3, 4, 5]);
    expect(db.notifications[0].title).toBe('지난 4~5주차 리포트도 만들어 뒀어요');
    expect(vi.mocked(deps.fetchWeekData).mock.calls.map(([q]) => q.weekIndex)).toEqual([4, 5]);
  });

  it('이미 리포트가 있는 주는 건너뛰고(AI·저장 없음) 나머지만 만든다', async () => {
    const db: FakeDb = { reports: [existingReport(2)], notifications: [] };
    const { deps } = makeDeps('2026-10-23', {}, db);
    await backfillPastReports(deps, UID);

    expect(createdWeeks(db).map(([w]) => w)).toEqual([2, 1, 3]);
    expect(deps.askGemini).toHaveBeenCalledTimes(2);
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0].title).toBe('지난 1·3주차 리포트도 만들어 뒀어요');
  });

  it('검증을 다시 해도(재시도) 리포트·푸시가 늘지 않는다', async () => {
    const { deps, db } = makeDeps('2026-10-23');
    await backfillPastReports(deps, UID);
    const again = await backfillPastReports(deps, UID);

    expect(db.reports).toHaveLength(3);
    expect(db.notifications).toHaveLength(1);
    expect(deps.askGemini).toHaveBeenCalledTimes(3);
    expect(again).toMatchObject({ created: [], notified: false });
  });

  it('만든 리포트가 없으면 푸시하지 않는다 (1주차 중, 시작 전, 시작일 없음, 기록 없음, 권한 없음)', async () => {
    const cases: [string, Partial<BackfillDeps>][] = [
      ['2026-10-07', {}], // 1주차 7일
      ['2026-09-20', {}], // 시작 전
      ['2026-10-23', { fetchStartDate: vi.fn(async () => null) }],
      [
        '2026-10-23',
        {
          fetchWeekData: vi.fn(async () => ({ ...filledWeek(), weights: [], todoDays: [] })),
        },
      ],
      ['2026-10-23', { hasPremiumAccess: vi.fn(async () => false) }],
    ];
    for (const [today, o] of cases) {
      const { deps, db } = makeDeps(today, o);
      await backfillPastReports(deps, UID);
      expect(db.reports).toEqual([]);
      expect(db.notifications).toEqual([]);
    }
  });

  it('empty 리포트(체중·할 일 기록 없음)는 저장하지만 푸시 문구에는 넣지 않는다', async () => {
    const { deps, db } = makeDeps('2026-10-16', {
      // 1주차: 레시피만, 2주차: 체중 기록
      fetchWeekData: vi.fn(async (q) =>
        q.weekIndex === 1
          ? {
              ...filledWeek(),
              weights: [],
              todoDays: [],
              recipes: [{ created_at: '2026-10-02T03:00:00Z', is_zero_carb: true }],
            }
          : filledWeek(q.range.from)
      ),
    });
    await backfillPastReports(deps, UID);

    expect(db.reports.map((r) => r.status)).toEqual(['empty', 'ready']);
    expect(db.notifications.map((n) => n.title)).toEqual(['지난 2주차 리포트도 만들어 뒀어요']);
    expect(db.notifications[0].href).toBe(`/report/${START}/2`);
  });

  it('지금 회차 시작일 기준 주만 본다: 다시 시작 전 회차의 주는 만들지 않는다', async () => {
    // 옛 회차(09-01 시작) 리포트가 있고, 10-01에 다시 시작
    const db: FakeDb = {
      reports: [existingReport(1, '2026-09-01'), existingReport(2, '2026-09-01')],
      notifications: [],
    };
    const { deps } = makeDeps('2026-10-09', {}, db);
    await backfillPastReports(deps, UID);

    expect(db.reports.slice(2).map((r) => [r.start_date, r.week_index, r.display_week])).toEqual([
      [START, 1, 1],
    ]);
  });

  it('한 주의 오류는 다음 주를 막지 않고, 만든 주만 푸시한다', async () => {
    const { deps, db } = makeDeps('2026-10-23', {
      fetchWeekData: vi.fn(async (q) => {
        if (q.weekIndex === 2) throw new Error('db down');
        return filledWeek(q.range.from);
      }),
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await backfillPastReports(deps, UID);
    error.mockRestore();

    expect(db.reports.map((r) => r.week_index)).toEqual([1, 3]);
    expect(db.notifications[0].title).toBe('지난 1·3주차 리포트도 만들어 뒀어요');
    expect(result).toMatchObject({ created: [1, 3], failed: 1 });
  });

  it('절대 던지지 않는다 (유저 조회·푸시 저장 실패)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = makeDeps('2026-10-23', {
      fetchStartDate: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(backfillPastReports(a.deps, UID)).resolves.toMatchObject({
      created: [],
      notified: false,
      failed: 1,
    });

    const b = makeDeps('2026-10-23', {
      insertNotification: vi.fn(async () => {
        throw new Error('push table down');
      }),
    });
    await expect(backfillPastReports(b.deps, UID)).resolves.toMatchObject({
      created: [1, 2, 3],
      notified: false,
      failed: 1,
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('마감 시각이 지나면 다음 주를 시작하지 않고, 그때까지 만든 주만 푸시한다', async () => {
    let clock = 0;
    const { deps, db } = makeDeps('2026-10-23', {
      insertReport: vi.fn(async (row: WeeklyReportRow) => {
        db.reports.push(row);
        clock = 1000; // 첫 리포트를 저장하고 나면 마감이 지난다
        return true;
      }),
    });
    await backfillPastReports(deps, UID, { deadline: 500, clock: () => clock });

    expect(db.reports.map((r) => r.week_index)).toEqual([1]);
    expect(db.notifications.map((n) => n.title)).toEqual(['지난 1주차 리포트도 만들어 뒀어요']);
  });
});

describe('backfillPastReports: 시작일을 바꿔 옛 토큰으로 반복 검증해도 리포트·AI가 늘지 않는다 (최종 리뷰 #3 I-1)', () => {
  const TODAY = '2026-10-23'; // 4주차
  const shift = (days: number) => {
    const d = new Date(`${START}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  it('1~3주차 리포트가 있고 시작일을 3일 미루면 겹치는 주라 아무것도 만들지 않는다', async () => {
    const db: FakeDb = {
      reports: [existingReport(1), existingReport(2), existingReport(3)],
      notifications: [],
    };
    const { deps } = makeDeps(TODAY, { fetchStartDate: vi.fn(async () => shift(3)) }, db);
    const result = await backfillPastReports(deps, UID);

    expect(result).toMatchObject({ created: [], notified: false });
    expect(db.reports).toHaveLength(3);
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(deps.fetchWeekData).not.toHaveBeenCalled();
    expect(db.notifications).toEqual([]);
  });

  it('첫 보충 뒤 시작일을 하루씩 미뤄 가며 반복해도 새 리포트·AI 호출이 없다 (리뷰 재현)', async () => {
    let startDate = START;
    const { deps, db } = makeDeps(TODAY, { fetchStartDate: vi.fn(async () => startDate) });
    await backfillPastReports(deps, UID); // 정상 보충: 1~3주차
    expect(db.reports).toHaveLength(3);
    expect(deps.askGemini).toHaveBeenCalledTimes(3);

    for (let k = 1; k <= 20; k++) {
      startDate = shift(k);
      await backfillPastReports(deps, UID);
    }
    expect(db.reports).toHaveLength(3);
    expect(deps.askGemini).toHaveBeenCalledTimes(3);
    expect(db.notifications).toHaveLength(1);
  });

  it('시작일을 앞당겨 겹침이 3일 이하인 주가 생겨도 24시간 몫(4개)을 넘지 않는다', async () => {
    // 기록은 시작일(10-01)부터 매일 있다
    let startDate = START;
    const { deps, db } = makeDeps(TODAY, {
      fetchStartDate: vi.fn(async () => startDate),
      fetchWeekData: vi.fn(async (q) =>
        q.range.to < START
          ? { ...filledWeek(q.range.from), weights: [], todoDays: [] }
          : filledWeek(q.range.from < START ? START : q.range.from)
      ),
    });
    await backfillPastReports(deps, UID); // 정상 보충: 1~3주차
    for (let k = -1; k >= -20; k--) {
      startDate = shift(k);
      await backfillPastReports(deps, UID);
    }
    expect(db.reports.length).toBeLessThanOrEqual(BACKFILL_DAILY_LIMIT);
    expect(vi.mocked(deps.askGemini).mock.calls.length).toBeLessThanOrEqual(BACKFILL_DAILY_LIMIT);
  });

  it('겹치지 않는 주가 계속 나와도 24시간에 만드는 리포트는 BACKFILL_DAILY_LIMIT개까지', async () => {
    expect(BACKFILL_DAILY_LIMIT).toBe(BACKFILL_MAX_REPORTS);
    let startDate = START;
    const { deps, db } = makeDeps(TODAY, { fetchStartDate: vi.fn(async () => startDate) });
    for (let k = 0; k >= -60; k -= 7) {
      startDate = shift(k);
      await backfillPastReports(deps, UID);
    }
    expect(db.reports.length).toBeLessThanOrEqual(BACKFILL_DAILY_LIMIT);
    expect(vi.mocked(deps.askGemini).mock.calls.length).toBeLessThanOrEqual(BACKFILL_DAILY_LIMIT);
  });

  it('24시간 안에 만든 리포트 수만큼 이번 보충 몫이 줄고, 다 쓰면 데이터도 읽지 않는다', async () => {
    const { deps, db } = makeDeps('2026-11-12', {
      countReportsCreatedSince: vi.fn(async () => BACKFILL_DAILY_LIMIT - 1),
    });
    await backfillPastReports(deps, UID);
    expect(db.reports.map((r) => r.week_index)).toEqual([1]);

    const full = makeDeps('2026-11-12', {
      countReportsCreatedSince: vi.fn(async () => BACKFILL_DAILY_LIMIT),
    });
    await backfillPastReports(full.deps, UID);
    expect(full.db.reports).toEqual([]);
    expect(full.deps.fetchReportPeriods).not.toHaveBeenCalled();
    expect(full.deps.askGemini).not.toHaveBeenCalled();
  });

  it('최근 리포트 수를 못 읽으면 보충하지 않는다 (비용 쪽으로 안전하게)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, db } = makeDeps(TODAY, {
      countReportsCreatedSince: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    const result = await backfillPastReports(deps, UID);
    error.mockRestore();

    expect(db.reports).toEqual([]);
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: [], failed: 1 });
  });

  it('24시간 기준 시각은 지금 - 24시간이다', async () => {
    const { deps } = makeDeps(TODAY);
    await backfillPastReports(deps, UID);
    expect(deps.countReportsCreatedSince).toHaveBeenCalledWith(
      UID,
      new Date(at(TODAY).getTime() - 24 * 60 * 60 * 1000)
    );
  });
});

describe('startReportBackfill: 응답을 막지 않는 백그라운드 실행', () => {
  it('작업을 schedule에 넘기고 바로 돌아온다 (동기 오류도 던지지 않음)', async () => {
    const { deps, db } = makeDeps('2026-10-09');
    const tasks: Promise<unknown>[] = [];
    startReportBackfill(deps, UID, { schedule: (t) => tasks.push(t) });

    expect(tasks).toHaveLength(1);
    await tasks[0];
    expect(db.reports).toHaveLength(1);
  });

  it('전체 제한 시간이 지나면 작업을 포기하고 오류를 삼킨다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = makeDeps('2026-10-09', {
      fetchStartDate: vi.fn(() => new Promise<string | null>(() => {})),
    });
    const tasks: Promise<unknown>[] = [];
    startReportBackfill(deps, UID, { schedule: (t) => tasks.push(t), timeoutMs: 10 });

    await expect(tasks[0]).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
