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
// enabled: false면 받지 않는다 (항상 떠 있는 주차 진입 팝업이 2주차 진입 때만 받게)
export const useWeeklyReports = (options?: { refetchOnMount?: 'always'; enabled?: boolean }) => {
  const uid = useUserStore((state) => state.id);

  const query = useQueryWith402Retry<WeeklyReport[]>({
    queryKey: [QueryKey.weeklyReports, uid],
    queryFn: failFastWhenOffline(WeeklyReportAPI.list),
    enabled: !!uid && (options?.enabled ?? true),
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

// from~to 중 기록(체중, 체크한 할 일)이 있는 날 (기록 탭 빈 칸의 [지금 만들기] 미리 막기). 실패하면 null = 모름
export const useReportRecordDays = (range: { from: string; to: string } | null) => {
  const uid = useUserStore((state) => state.id);

  const query = useQueryWith402Retry<string[]>({
    queryKey: [QueryKey.weeklyReports, uid, 'recordDays', range?.from, range?.to],
    queryFn: failFastWhenOffline(() => WeeklyReportAPI.recordDays(range!.from, range!.to)),
    enabled: !!uid && !!range,
    refetchOnMount: 'always',
  });
  return query.isSuccess ? query.data : null;
};

// 리포트 상세 [다시 만들기]를 보일지 (서버 generate-my-report mode check). enabled: 패스 유저의 지금 회차 리포트
export const useCanRegenerateReport = (startDate: string, weekIndex: number, enabled: boolean) => {
  const uid = useUserStore((state) => state.id);

  const query = useQueryWith402Retry<boolean>({
    queryKey: [QueryKey.weeklyReports, uid, startDate, weekIndex, 'canRegenerate'],
    queryFn: () => WeeklyReportAPI.canRegenerate(startDate, weekIndex),
    enabled: !!uid && enabled,
    refetchOnMount: 'always',
  });
  return query.data === true;
};

// 직접 만들기·다시 만들기로 받은 리포트를 캐시에 넣고(상세는 바로, 목록은 다시 받기) 다시 만들기 표시를 끈다
export const cacheGeneratedReport = (report: WeeklyReport) => {
  const uid = useUserStore.getState().id;
  queryClient.setQueryData(
    [QueryKey.weeklyReports, uid, report.start_date, report.week_index],
    report
  );
  queryClient.setQueryData(
    [QueryKey.weeklyReports, uid, report.start_date, report.week_index, 'canRegenerate'],
    false
  );
  queryClient.setQueryData<WeeklyReport[]>([QueryKey.weeklyReports, uid], (prev) =>
    prev
      ? [
          report,
          ...prev.filter(
            (r) => !(r.start_date === report.start_date && r.week_index === report.week_index)
          ),
        ]
      : prev
  );
  void queryClient.invalidateQueries({ queryKey: [QueryKey.weeklyReports, uid], exact: true });
};
