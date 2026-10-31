import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { StatisticsDB } from 'types/database';
import { TodoRateStatistics } from 'types/statistics';
import { getKoreanDateString } from 'utils/date';
import { programWeekAndDay } from 'utils/programStart';
import { sendError } from 'utils/sendError';
import { buildTodoRateWeeks, shiftStatistics } from 'utils/todoRateWeeks';

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

// 주차 맞추기 뒤: 지난 행을 새 시작일 기준 같은 날짜 칸으로 옮기고(shiftStatistics), 오늘 칸(cut)부터는 지운다.
// 행을 모두 읽어 지우고 옮긴 행을 다시 넣는다. 한 번에 묶이지 않아, 지운 뒤 넣기가 실패하면 지난 완료율이 빈다
// (예전 deleteFrom도 오늘부터는 지웠고, 남은 행은 다른 날짜 칸에 보였다)
const realignAfterShift = async (deltaDays: number, cut: { week: number; day: number }) =>
  sendError(async () => {
    const userId = useUserStore.getState().id;
    if (!userId) return false;

    const { data, error } = await supabase
      .from('statistics')
      .select('week, day, todo_rate')
      .eq('uid', userId);
    if (error) throw error;

    const shifted = shiftStatistics(data ?? [], deltaDays, cut);

    const { error: deleteError } = await supabase.from('statistics').delete().eq('uid', userId);
    if (deleteError) throw deleteError;

    if (shifted.length > 0) {
      const { error: insertError } = await supabase
        .from('statistics')
        .insert(shifted.map((row) => ({ ...row, uid: userId })));
      if (insertError) throw insertError;
    }

    return true;
  });

export const StatisticsAPI = {
  getTodoRatesByWeeks,
  upsert,
  deleteFrom,
  realignAfterShift,
};
