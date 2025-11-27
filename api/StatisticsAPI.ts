import { addDays, format } from 'date-fns';
import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { StatisticsDB } from 'types/database';
import { TodoRateStatistics } from 'types/statistics';
import { convertToKoreanDate, getKoreanDateString } from 'utils/date';
import { sendError } from 'utils/sendError';

export const getTodoRatesByWeeks = async () =>
  sendError<TodoRateStatistics>(async () => {
    const { start_date, id } = useUserStore.getState();

    if (!start_date) {
      return {
        weeks: Array.from({ length: 4 }, () => ({
          todoRatesByWeek: Array(7).fill(0),
          average: 0,
        })),
      };
    }

    const start = convertToKoreanDate(start_date);
    const end = addDays(start, 27); // 총 28일 (4주)

    const { data: statistics, error } = await supabase
      .from('statistics')
      .select('*')
      .eq('uid', id)
      .gte('created_at', format(start, 'yyyy-MM-dd'))
      .lte('created_at', format(end, 'yyyy-MM-dd'))
      .order('created_at', { ascending: true });

    if (error) throw error;

    const dateMap = new Map<string, number>();

    statistics.forEach((row) => {
      const dateKey = format(convertToKoreanDate(row.created_at), 'yyyy-MM-dd');
      dateMap.set(dateKey, row.todo_rate);
    });

    const weeks = [];

    for (let week = 0; week < 4; week++) {
      let todoRatesByWeek: number[] = [];

      for (let day = 0; day < 7; day++) {
        const currentDate = addDays(start, week * 7 + day);
        const key = format(currentDate, 'yyyy-MM-dd');
        const value = dateMap.get(key) ?? 0;
        todoRatesByWeek.push(value);
      }

      const todoRatesSum = todoRatesByWeek.reduce((acc, cur) => acc + cur, 0);
      const average = Math.round(todoRatesSum / todoRatesByWeek.length);

      weeks.push({
        todoRatesByWeek,
        average,
      });
    }

    return { weeks };
  });

const upsert = async (todoRate: number) =>
  sendError<StatisticsDB>(async () => {
    const userId = useUserStore.getState().id;
    const today = getKoreanDateString();

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
  getTodoRatesByWeeks,
  upsert,
};
