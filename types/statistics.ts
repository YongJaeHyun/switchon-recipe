import { Nullable } from './common';

export interface TodoRateStatistics {
  weeks: TodoRateStatistic[];
}

export interface TodoRateStatistic {
  todoRatesByWeek: Nullable<number>[];
  average: number;
}
