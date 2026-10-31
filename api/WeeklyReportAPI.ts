import axios from 'axios';
import { supabase } from 'lib/supabase';
import type { WeeklyReport } from 'types/report';
import { classifyFoodCheckRequestError } from 'utils/foodCheckResponse';
import { toWeeklyReport } from 'utils/reportDisplay';
import { type GenerateMyReportOutcome, interpretGenerateMyReport } from 'utils/reportOnDemand';
import { captureError } from 'utils/sendError';
import { UserAPI } from './UserAPI';

// 직접 만들기·다시 만들기는 Gemini(최대 30초)를 기다린다
const GENERATE_TIMEOUT_MS = 60 * 1000;

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

const callGenerateMyReport = async (body: {
  start_date: string;
  week_index: number;
  mode: 'create' | 'regenerate' | 'check';
}) => {
  const session = await UserAPI.getSession();
  return axios.post(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-my-report`,
    body,
    {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: GENERATE_TIMEOUT_MS,
      // 상태 코드별 해석은 interpretGenerateMyReport가 한다
      validateStatus: () => true,
    }
  );
};

// 리포트 직접 만들기(create, 리포트가 없는 주)·다시 만들기(regenerate). 패스 전용, 서버가 최종 판단한다.
// 서버가 정한 결과는 GenerateMyReportOutcome으로, 네트워크 오류·시간 초과는 'network'로 돌려준다 (던지지 않는다)
const generate = async (
  startDate: string,
  weekIndex: number,
  mode: 'create' | 'regenerate'
): Promise<GenerateMyReportOutcome | { status: 'network' }> => {
  try {
    const response = await callGenerateMyReport({
      start_date: startDate,
      week_index: weekIndex,
      mode,
    });
    const outcome = interpretGenerateMyReport(response.status, response.data);
    if (outcome.status === 'error') {
      captureError({
        error: new Error(`generate-my-report ${response.status}: ${JSON.stringify(response.data)}`),
        prefix: '[WeeklyReportAPI.generate]: ',
      });
    }
    return outcome;
  } catch (error) {
    const kind = classifyFoodCheckRequestError(error);
    if (kind === 'network' || kind === 'timeout') return { status: 'network' };
    captureError({ error, prefix: '[WeeklyReportAPI.generate]: ' });
    return { status: 'error' };
  }
};

// 리포트 상세의 [다시 만들기]를 보일지 (생성 뒤 그 주 기록이 바뀌었고 오늘 다시 만든 적 없음, 패스).
// 실패하면 false (버튼을 숨긴다). 실제로 누르면 서버가 다시 판단한다
const canRegenerate = async (startDate: string, weekIndex: number): Promise<boolean> => {
  try {
    const response = await callGenerateMyReport({
      start_date: startDate,
      week_index: weekIndex,
      mode: 'check',
    });
    return response.status === 200 && response.data?.can_regenerate === true;
  } catch {
    return false;
  }
};

// from~to(yyyy-MM-dd) 중 기록(체중, 체크한 할 일)이 있는 날. 기록 탭 빈 칸의 [지금 만들기]를 미리 막는 데만 쓴다
// (서버가 최종 판단). 실패 시 throw: 호출부는 모르는 것으로 보고 버튼을 열어 둔다
const recordDays = async (from: string, to: string): Promise<string[]> => {
  const [weights, todos] = await Promise.all([
    supabase.from('weight_log').select('day').gte('day', from).lte('day', to),
    supabase.from('todo_daily').select('day, checked').gte('day', from).lte('day', to),
  ]);
  if (weights.error) throw weights.error;
  if (todos.error) throw todos.error;
  return [
    ...(weights.data ?? []).map((w) => String(w.day)),
    ...(todos.data ?? [])
      .filter((t) => Array.isArray(t.checked) && t.checked.length > 0)
      .map((t) => String(t.day)),
  ];
};

export const WeeklyReportAPI = { list, get, generate, canRegenerate, recordDays };
