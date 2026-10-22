// 주간 리포트 타입. 서버 supabase/functions/_shared/weeklyStats.ts(WeeklyStats),
// weeklyReport.ts(ReportContent)의 앱 복사본 (앱은 서버 코드를 런타임에 import하지 않는다).
// types/report.typecheck.test.ts가 두 쪽이 같은 모양인지 tsc로 확인한다. 한쪽을 고치면 다른 쪽도 고친다.

export type ReportMeal = 'breakfast' | 'lunch' | 'dinner';

export interface ReportContent {
  summary: string; // 한 줄 요약
  good: string; // 잘한 점 1개
  improve: string; // 아쉬운 점 1개
  action: string; // 다음 주 행동 1개
  actionLink: { meal: ReportMeal } | null; // [추천 보기] 버튼용
  weightNote: string; // 체중 해석
  nextWeek: string; // 다음 주 달라지는 점 (줄바꿈 포함 가능)
}

export interface TodoDayRate {
  day: string;
  weekday: string;
  rate: number; // 0~100 정수
}

export interface WeeklyStats {
  weekIndex: number;
  range: { from: string; to: string }; // KST 날짜
  weight: {
    start: number | null;
    end: number | null;
    diff: number | null;
    daysLogged: number;
    totalDiff: number | null;
  };
  todo: {
    avgRate: number | null;
    best: TodoDayRate | null;
    worst: TodoDayRate | null;
    items: { name: string; done: number; appeared: number }[];
  };
  fasting: {
    planned: number;
    success: number;
    broken: number;
    pending: number; // 리포트 생성 시점에 아직 결과를 답할 수 있던 단식 (실패가 아님)
    successWeekdays: string[];
  };
  recipes: { total: number; low: number; zero: number };
  foodChecks: { total: number; avoid: number };
  isEmpty: boolean;
}

export type ReportStatus = 'ready' | 'empty';

// 화면에서 쓰는 리포트 한 건. stats/content는 parse*로 걸러서 깨진 행도 화면이 죽지 않게 한다
export interface WeeklyReport {
  start_date: string;
  week_index: number;
  status: ReportStatus;
  stats: WeeklyStats | null;
  content: ReportContent | null;
  created_at: string;
}
