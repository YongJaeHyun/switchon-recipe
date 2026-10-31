import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { StatisticsDB } from 'types/database';
import { TodoRateStatistics } from 'types/statistics';
import { getKoreanDateString } from 'utils/date';
import { programWeekAndDay } from 'utils/programStart';
import { captureError, sendError } from 'utils/sendError';
import { realignStatistics, type RealignResult } from 'utils/statisticsRealign';
import { buildTodoRateWeeks } from 'utils/todoRateWeeks';

export const getTodoRatesByWeeks = async () =>
  sendError<TodoRateStatistics>(async () => {
    const { start_date, id } = useUserStore.getState();
    const progress = programWeekAndDay(start_date, getKoreanDateString({ formatType: 'date' }));

    if (!start_date) {
      return {
        weeks: Array.from({ length: 4 }, () => ({
          todoRatesByWeek: Array(7).fill(0),
          average: 0,
        })),
      };
    }

    const { data: statistics, error } = await supabase
      .from('statistics')
      .select('*')
      .eq('uid', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // 시작 전이면 어떤 날도 지나지 않은 것으로 (1주차 1일 0% 막대가 생기지 않게)
    const weeks = buildTodoRateWeeks(statistics, progress);

    return { weeks };
  });

const upsert = async (todoRate: number) =>
  sendError<StatisticsDB | null>(async () => {
    const userId = useUserStore.getState().id;
    // 사용자 정보를 불러오기 전(uid 없음)에는 보내지 않는다
    if (!userId) return null;
    const startDate = useUserStore.getState().start_date;
    const { week, day, beforeStart } = programWeekAndDay(
      startDate,
      getKoreanDateString({ formatType: 'date' })
    );
    // 시작 전에는 1주차 1일로 기록하지 않는다
    if (beforeStart) return null;

    const { data, error } = await supabase
      .from('statistics')
      .upsert({ uid: userId, todo_rate: todoRate, week, day }, { onConflict: 'uid,week,day' })
      .eq('uid', userId)
      .select()
      .single();

    if (error) throw error;

    return data;
  });

const deleteFrom = async (week: number, day: number) =>
  sendError(async () => {
    const userId = useUserStore.getState().id;
    if (!userId) return false;

    const { error } = await supabase
      .from('statistics')
      .delete()
      .or(`week.gt.${week},and(week.eq.${week},day.gte.${day})`)
      .eq('uid', userId);

    if (error) throw error;

    return true;
  });

// 주차 맞추기 뒤: 지난 행을 새 시작일 기준 같은 날짜 칸으로 옮기고, 오늘 칸(cut)부터는 새로 쌓는다.
// 먼저 쓰고 나중에 지운다 (utils/statisticsRealign): 옮긴 행 upsert가 실패하면 예전처럼 오늘 칸부터만 지우고,
// 남은 행 지우기가 실패하면 옛 칸 행이 남는다. 어느 쪽도 지난 기록을 잃지 않는다. 실패는 Sentry로만 남긴다 (토스트 없음)
const realignAfterShift = async (
  deltaDays: number,
  cut: { week: number; day: number }
): Promise<RealignResult | null> => {
  const userId = useUserStore.getState().id;
  if (!userId) return null;
  const report = (error: unknown) =>
    captureError({ error, prefix: '[StatisticsAPI.realignAfterShift]: ' });
  const orThrow = <T>(result: { data: T; error: unknown }): T => {
    if (result.error) {
      report(result.error);
      throw result.error;
    }
    return result.data;
  };

  return realignStatistics(
    {
      select: async () =>
        orThrow(
          await supabase.from('statistics').select('week, day, todo_rate').eq('uid', userId)
        ) ?? [],
      upsert: async (rows) =>
        (
          orThrow(
            await supabase
              .from('statistics')
              .upsert(
                rows.map((row) => ({ ...row, uid: userId })),
                { onConflict: 'uid,week,day' }
              )
              .select('id')
          ) ?? []
        ).map((row) => row.id),
      deleteExcept: async (ids) => {
        let query = supabase.from('statistics').delete().eq('uid', userId);
        if (ids.length > 0) query = query.not('id', 'in', `(${ids.join(',')})`);
        orThrow(await query);
      },
      deleteFrom: async (week, day) => {
        orThrow(
          await supabase
            .from('statistics')
            .delete()
            .or(`week.gt.${week},and(week.eq.${week},day.gte.${day})`)
            .eq('uid', userId)
        );
      },
    },
    deltaDays,
    cut
  );
};

export const StatisticsAPI = {
  getTodoRatesByWeeks,
  upsert,
  deleteFrom,
  realignAfterShift,
};
