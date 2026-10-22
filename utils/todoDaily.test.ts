import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  areTodoChecksCurrent,
  createTodoDailySync,
  isTodoListCurrent,
  todoDailySnapshot,
} from './todoDaily';

describe('todoDailySnapshot', () => {
  it('stores the visible todo texts in id order and checked positions in that list', () => {
    const todos = [
      { id: 3, value: '저녁' },
      { id: 1, value: '점심' },
      { id: 2, value: '간식' },
    ];
    expect(todoDailySnapshot(todos, [3, 1])).toEqual({
      items: ['점심', '간식', '저녁'],
      checked: [0, 2],
    });
  });

  it('ignores checked ids that are not in today list (fasting day)', () => {
    expect(todoDailySnapshot([{ id: 0, value: '아침' }], [0, 2])).toEqual({
      items: ['아침'],
      checked: [0],
    });
  });

  it('handles no checks', () => {
    expect(todoDailySnapshot([{ id: 0, value: '아침' }], [])).toEqual({
      items: ['아침'],
      checked: [],
    });
  });
});

describe('isTodoListCurrent', () => {
  const base = { hydrated: true, week: 2, storeWeek: 2, fastingResetting: false };

  it('주차가 반영됐고 단식 초기화가 끝났으면 오늘 목록이다', () => {
    expect(isTodoListCurrent(base)).toBe(true);
  });

  it('새 주 첫날 아직 주차가 반영 전이거나 단식 초기화 중이면 아니다 (지난 주 단식 요일로 자르지 않게)', () => {
    expect(isTodoListCurrent({ ...base, storeWeek: 1 })).toBe(false);
    expect(isTodoListCurrent({ ...base, fastingResetting: true })).toBe(false);
    expect(isTodoListCurrent({ ...base, hydrated: false })).toBe(false);
  });
});

describe('areTodoChecksCurrent', () => {
  const base = {
    hydrated: true,
    week: 2,
    storeWeek: 2,
    day: 3,
    storeDay: 3,
    fastingResetting: false,
    todosResetting: false,
  };

  it('일차가 반영됐고 할 일 초기화가 끝났으면 체크도 오늘 것이다', () => {
    expect(areTodoChecksCurrent(base)).toBe(true);
  });

  it('날이 바뀐 직후(일차 반영 전, 초기화 중)에는 어제 체크일 수 있다', () => {
    expect(areTodoChecksCurrent({ ...base, storeDay: 2 })).toBe(false);
    expect(areTodoChecksCurrent({ ...base, todosResetting: true })).toBe(false);
    expect(areTodoChecksCurrent({ ...base, storeWeek: 1 })).toBe(false);
  });
});

describe('createTodoDailySync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (results: { upsert?: boolean[]; insert?: boolean[] } = {}) => {
    const upsertResults = [...(results.upsert ?? [])];
    const insertResults = [...(results.insert ?? [])];
    const upsert = vi.fn(async () => upsertResults.shift() ?? true);
    const insertIfAbsent = vi.fn(async () => insertResults.shift() ?? true);
    const sync = createTodoDailySync({ upsert, insertIfAbsent, debounceMs: 500 });
    return { sync, upsert, insertIfAbsent };
  };
  const body = (day: string, checked: number[] = []) => ({ day, items: ['아침'], checked });

  describe('첫 스냅샷', () => {
    it('성공하면 그날은 다시 보내지 않는다', async () => {
      const { sync, insertIfAbsent } = setup();
      sync.sendSnapshot('u:2026-10-20', { day: '2026-10-20', items: ['아침'] });
      await vi.runAllTimersAsync();
      sync.sendSnapshot('u:2026-10-20', { day: '2026-10-20', items: ['아침'] });
      await vi.runAllTimersAsync();
      expect(insertIfAbsent).toHaveBeenCalledTimes(1);
    });

    it('실패하면(오프라인 등) 다음 기회에 다시 보낸다', async () => {
      const { sync, insertIfAbsent } = setup({ insert: [false, true] });
      sync.sendSnapshot('u:2026-10-20', { day: '2026-10-20', items: ['아침'] });
      await vi.runAllTimersAsync();
      sync.sendSnapshot('u:2026-10-20', { day: '2026-10-20', items: ['아침'] });
      await vi.runAllTimersAsync();
      sync.sendSnapshot('u:2026-10-20', { day: '2026-10-20', items: ['아침'] });
      await vi.runAllTimersAsync();
      expect(insertIfAbsent).toHaveBeenCalledTimes(2);
    });

    it('보내는 중에 겹친 호출은 건너뛴다', async () => {
      const { sync, insertIfAbsent } = setup();
      sync.sendSnapshot('u:2026-10-20', { day: '2026-10-20', items: ['아침'] });
      sync.sendSnapshot('u:2026-10-20', { day: '2026-10-20', items: ['아침'] });
      await vi.runAllTimersAsync();
      expect(insertIfAbsent).toHaveBeenCalledTimes(1);
    });
  });

  describe('체크 기록', () => {
    it('빠르게 여러 번 체크하면 마지막 상태만 보낸다', async () => {
      const { sync, upsert } = setup();
      sync.queueUpsert(body('2026-10-20', [0]));
      sync.queueUpsert(body('2026-10-20', []));
      await vi.runAllTimersAsync();
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledWith(body('2026-10-20', []));
    });

    it('보내기에 실패하면 그날은 다시 보내야 한다고 알려 준다', async () => {
      const { sync } = setup({ upsert: [false] });
      sync.queueUpsert(body('2026-10-20', [0]));
      await vi.runAllTimersAsync();
      expect(sync.needsResend('2026-10-20')).toBe(true);
      // 날이 바뀌면 어제 상태는 다시 보내지 않는다
      expect(sync.needsResend('2026-10-21')).toBe(false);
    });

    it('다시 보내 성공하면 더는 다시 보낼 필요가 없다', async () => {
      const { sync } = setup({ upsert: [false, true] });
      sync.queueUpsert(body('2026-10-20', [0]));
      await vi.runAllTimersAsync();
      sync.queueUpsert(body('2026-10-20', [0]));
      await vi.runAllTimersAsync();
      expect(sync.needsResend('2026-10-20')).toBe(false);
    });

    it('성공하면 다시 보낼 것이 없다', async () => {
      const { sync } = setup();
      sync.queueUpsert(body('2026-10-20', [0]));
      await vi.runAllTimersAsync();
      expect(sync.needsResend('2026-10-20')).toBe(false);
    });

    it('늦게 끝난 예전 요청 결과로 최신 요청의 실패를 덮지 않는다', async () => {
      let resolveFirst: (ok: boolean) => void = () => {};
      const upsert = vi
        .fn<(b: ReturnType<typeof body>) => Promise<boolean>>()
        .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
        .mockImplementationOnce(async () => false);
      const sync = createTodoDailySync({
        upsert,
        insertIfAbsent: async () => true,
        debounceMs: 500,
      });
      sync.queueUpsert(body('2026-10-20', [0]));
      await vi.advanceTimersByTimeAsync(500);
      sync.queueUpsert(body('2026-10-20', []));
      await vi.advanceTimersByTimeAsync(500);
      resolveFirst(true);
      await vi.runAllTimersAsync();
      expect(sync.needsResend('2026-10-20')).toBe(true);
    });
  });
});
