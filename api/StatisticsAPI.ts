import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { Nullable } from 'types/common';
import { StatisticsDB } from 'types/database';
import { TodoRateStatistics } from 'types/statistics';
import { getWeekAndDay } from 'utils/date';
import { sendError } from 'utils/sendError';

export const getTodoRatesByWeeks = async () =>
  sendError<TodoRateStatistics>(async () => {
    const { start_date, id } = useUserStore.getState();
    const { week: userWeek, day: userDay } = getWeekAndDay(start_date);

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

    const dateMap = new Map<string, number>();

    statistics.forEach((row) => {
      const dateKey = `${row.week}-${row.day}`;
      dateMap.set(dateKey, row.todo_rate);
    });

    const weeks = [];

    for (let week = 1; week <= 4; week++) {
      let todoRatesByWeek: Nullable<number>[] = [];

      for (let day = 1; day <= 7; day++) {
        const isReached = week < userWeek || (week <= userWeek && day <= userDay);

        if (!isReached) {
          todoRatesByWeek.push(null);
          continue;
        }

        const key = `${week}-${day}`;
        const value = dateMap.get(key) ?? 0;
        todoRatesByWeek.push(value);
      }

      const filteredTodoRates = todoRatesByWeek.filter(
        (rate) => typeof rate === 'number'
      ) satisfies number[];

      const todoRatesSum = filteredTodoRates.reduce((acc, cur) => acc + cur, 0);
      const average =
        filteredTodoRates.length > 0 ? Math.round(todoRatesSum / filteredTodoRates.length) : 0;

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
    const startDate = useUserStore.getState().start_date;
    const { week, day } = getWeekAndDay(startDate);

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
