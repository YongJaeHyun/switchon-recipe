import { shiftStatistics } from './todoRateWeeks';

type Cell = { week: number; day: number; todo_rate: number };

// 할 일 통계(statistics) 표에 하는 일. API(StatisticsAPI.realignAfterShift)가 supabase로 채운다. 실패하면 throw
export interface RealignDeps {
  // 내 모든 행
  select(): Promise<{ week: number | null; day: number | null; todo_rate: number }[]>;
  // (uid, week, day) 충돌이면 덮어쓰는 한 문장 upsert. 쓴 행의 id
  upsert(rows: Cell[]): Promise<number[]>;
  // ids 밖의 내 행을 모두 지운다 (ids가 비면 모두)
  deleteExcept(ids: number[]): Promise<void>;
  // 예전 정리: (week, day) 칸부터 지운다
  deleteFrom(week: number, day: number): Promise<void>;
}

// realigned = 옮김 / fallback = 옮기지 못해 예전처럼 오늘 칸부터만 지움 / partial = 옮겼지만 옛 칸 행이 남음 /
// failed = 옮기지도 지우지도 못함 (오늘 칸 완료율이 남는다). 어느 경우든 지난 기록을 잃지 않는다
export type RealignResult = 'realigned' | 'fallback' | 'partial' | 'failed';

// 주차 맞추기 뒤 지난 할 일 통계를 새 시작일 기준 같은 날짜 칸으로 옮긴다 (shiftStatistics). 먼저 쓰고 나중에 지운다:
// 1) 읽어서 옮길 행 계산 2) 옮긴 행 upsert (한 문장이라 실패하면 아무것도 바뀌지 않음 → 예전처럼 deleteFrom(cut))
// 3) 쓴 행 밖의 행(옛 칸·오늘 칸 이후)을 지운다. 3이 실패하면 옛 칸 행이 남아 예전 표시 문제만 남는다.
// 옮기면 새 시작일 전으로 가는 행(주차를 미룬 경우)은 3에서 지워진다 (달력에 칸이 없다). 같은 날 되돌려도 돌아오지 않는다
export async function realignStatistics(
  deps: RealignDeps,
  deltaDays: number,
  cut: { week: number; day: number }
): Promise<RealignResult> {
  const fallback = async (): Promise<RealignResult> => {
    try {
      await deps.deleteFrom(cut.week, cut.day);
      return 'fallback';
    } catch {
      return 'failed';
    }
  };

  let ids: number[];
  try {
    const shifted = shiftStatistics(await deps.select(), deltaDays, cut).map(
      ({ week, day, todo_rate }) => ({ week, day, todo_rate })
    );
    ids = shifted.length > 0 ? await deps.upsert(shifted) : [];
  } catch {
    return fallback();
  }

  try {
    await deps.deleteExcept(ids);
    return 'realigned';
  } catch {
    return 'partial';
  }
}
