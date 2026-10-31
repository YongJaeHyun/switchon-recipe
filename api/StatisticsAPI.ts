import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { StatisticsDB } from 'types/database';
import { TodoRateStatistics } from 'types/statistics';
import { getKoreanDateString } from 'utils/date';
import { programWeekAndDay } from 'utils/programStart';
import { sendError } from 'utils/sendError';
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

export const StatisticsAPI = {
  getTodoRatesByWeeks,
  upsert,
  deleteFrom,
};
