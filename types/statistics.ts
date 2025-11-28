export interface TodoRateStatistics {
  weeks: TodoRateStatistic[];
}

export interface TodoRateStatistic {
  todoRatesByWeek: number[];
  average: number;
}
