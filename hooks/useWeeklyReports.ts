import { WeeklyReportAPI } from 'api/WeeklyReportAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useUserStore } from 'stores/userStore';
import type { WeeklyReport } from 'types/report';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { isReportHref } from 'utils/reportDisplay';
import { useQueryWith402Retry } from './useCustomQuery';

// 내 주간 리포트 전체 (최신 먼저). 무효화는 [QueryKey.weeklyReports] 접두어로 한다
// refetchOnMount: 'always'면 화면을 열 때마다 새로 받는다 (목록 화면)
export const useWeeklyReports = (options?: { refetchOnMount?: 'always' }) => {
  const uid = useUserStore((state) => state.id);

  const query = useQueryWith402Retry<WeeklyReport[]>({
    queryKey: [QueryKey.weeklyReports, uid],
    queryFn: failFastWhenOffline(WeeklyReportAPI.list),
    enabled: !!uid,
    refetchOnMount: options?.refetchOnMount ?? true,
  });

  return {
    reports: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
};

// 리포트 한 건. 목록을 이미 받았으면 그 값을 먼저 보여주고, 알림으로 바로 들어오면 한 건만 받는다
export const useWeeklyReport = (startDate: string, weekIndex: number) => {
  const uid = useUserStore((state) => state.id);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && Number.isInteger(weekIndex);

  const query = useQueryWith402Retry<WeeklyReport | null>({
    queryKey: [QueryKey.weeklyReports, uid, startDate, weekIndex],
    queryFn: failFastWhenOffline(() => WeeklyReportAPI.get(startDate, weekIndex)),
    enabled: !!uid && valid,
    initialData: () =>
      queryClient
        .getQueryData<WeeklyReport[]>([QueryKey.weeklyReports, uid])
        ?.find((r) => r.start_date === startDate && r.week_index === weekIndex),
  });

  return {
    report: query.data ?? null,
    isLoading: valid && query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
};

// 리포트 알림(href /report/...)이면 목록·상세 캐시를 무효화한다 (앱이 열려 있을 때 새 리포트 반영)
export const invalidateWeeklyReportsFor = (href: unknown) => {
  if (isReportHref(href)) {
    queryClient.invalidateQueries({ queryKey: [QueryKey.weeklyReports] });
  }
};
