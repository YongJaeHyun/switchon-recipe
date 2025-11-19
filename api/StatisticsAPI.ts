import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { StatisticsDB } from 'types/database';
import { TodoRateStatistic } from 'types/statistics';
import { getKoreanToday } from 'utils/date';
import { sendError } from 'utils/sendError';

const selectAllInMonth = async (year: number, month: number) =>
  sendError<TodoRateStatistic[]>(async () => {
    const userId = useUserStore.getState().id;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const lastDay = endDate.getDate();

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const { data: statistics, error } = await supabase
      .from('statistics')
      .select('*')
      .eq('uid', userId)
      .gte('created_at', startDateStr)
      .lte('created_at', endDateStr);

    if (error) throw error;

    const result = Array.from({ length: lastDay }, (_, idx) => {
      const day = idx + 1;

      const record = statistics?.find((item: StatisticsDB) => {
        const d = new Date(item.created_at).getDate();
        return d === day;
      });

      return {
        day,
        todoRate: record?.todo_rate ?? 0,
      };
    });

    return result;
  });

const upsert = async (todoRate: number) =>
  sendError<StatisticsDB>(async () => {
    const userId = useUserStore.getState().id;
    const today = getKoreanToday();

    const { data, error } = await supabase
      .from('statistics')
      .upsert({ uid: userId, todo_rate: todoRate, created_at: today }, { onConflict: 'uid' })
      .eq('uid', userId)
      .eq('created_at', today)
      .select()
      .single();

    if (error) throw error;

    return data;
  });

export const StatisticsAPI = {
  selectAllInMonth,
  upsert,
};
