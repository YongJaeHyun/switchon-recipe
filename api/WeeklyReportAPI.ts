import { supabase } from 'lib/supabase';
import type { WeeklyReport } from 'types/report';
import { toWeeklyReport } from 'utils/reportDisplay';
import { captureError } from 'utils/sendError';

// 내 주간 리포트 전체 (최신 먼저). RLS로 내 것만 읽으므로 패스가 끝나도 지난 리포트를 볼 수 있다.
// 실패 시 throw: 호출부(React Query)가 재시도/표시를 정한다
const list = async (): Promise<WeeklyReport[]> => {
  const { data, error } = await supabase
    .from('weekly_report')
    .select('*')
    .order('start_date', { ascending: false })
    .order('week_index', { ascending: false });

  if (error || !data) {
    captureError({
      error: error ?? new Error('empty response'),
      prefix: '[WeeklyReportAPI.list]: ',
    });
    throw error ?? new Error('weekly_report: empty response');
  }
  return data.map(toWeeklyReport);
};

// 리포트 한 건 (알림으로 바로 들어온 경우). 없으면 null
const get = async (startDate: string, weekIndex: number): Promise<WeeklyReport | null> => {
  const { data, error } = await supabase
    .from('weekly_report')
    .select('*')
    .eq('start_date', startDate)
    .eq('week_index', weekIndex)
    .maybeSingle();

  if (error) {
    captureError({ error, prefix: '[WeeklyReportAPI.get]: ' });
    throw error;
  }
  return data ? toWeeklyReport(data) : null;
};

export const WeeklyReportAPI = { list, get };
