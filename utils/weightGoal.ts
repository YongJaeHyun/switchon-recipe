import { type BodyCompKind, parseBodyCompInput } from './bodyComp';
import { programStartOf } from './programStart';
import { parseWeightInput, round1, type WeightPoint, weightsInPeriod } from './weight';

// 체중 목표 (user_setting 열). 골격근량·체지방량 목표는 선택
export interface WeightGoal {
  weight_goal_kg: number | null;
  muscle_goal_kg: number | null;
  fat_goal_kg: number | null;
}

// 달성한 목표 하나 (user_setting.weight_goal_history 항목)
export interface GoalHistoryItem {
  goal_kg: number;
  reached_on: string; // yyyy-MM-dd (KST)
  reached_kg: number;
}

export interface WeightGoalState extends WeightGoal {
  history: GoalHistoryItem[];
}

export interface GoalInputTexts {
  weight: string;
  muscle: string;
  fat: string;
}

export interface GoalPeriod {
  startDate: string | null;
  programStart?: string | null;
  // 달성한 목표 목록 (날짜순). 새 목표의 시작 지점을 정한다
  history?: GoalHistoryItem[];
}

export interface GoalProgress {
  goal: number;
  start: number;
  current: number;
  // 남은 kg (0 이상)
  remaining: number;
  // 0~100 (시작이 목표 이하면 닿기 전 0, 닿으면 100)
  percent: number;
  // 지금(가장 최근) 체중이 목표 이하. 카드의 "닿았어요"는 이것만 본다
  reached: boolean;
  // 이 목표값이 지금 프로그램의 달성 기록에 이미 있다 (축하·기록 추가를 다시 하지 않는다)
  recorded: boolean;
}

const toNum = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const byReachedOn = (a: GoalHistoryItem, b: GoalHistoryItem) =>
  a.reached_on < b.reached_on ? -1 : a.reached_on > b.reached_on ? 1 : 0;

// jsonb 달성 기록 → 모양이 맞는 항목만, 날짜순
export function goalHistoryFromJson(json: unknown): GoalHistoryItem[] {
  if (!Array.isArray(json)) return [];
  const items: GoalHistoryItem[] = [];
  json.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    const goal = toNum(r.goal_kg);
    const kg = toNum(r.reached_kg);
    if (goal === null || kg === null || !isDay(r.reached_on)) return;
    items.push({ goal_kg: goal, reached_on: r.reached_on, reached_kg: kg });
  });
  return items.sort(byReachedOn);
}

// user_setting 행 → 목표. 행이 없거나 열이 없으면(마이그레이션 전) 목표 없음
export function goalFromRow(
  row: Partial<Record<keyof WeightGoal | 'weight_goal_history', unknown>> | null | undefined
): WeightGoalState {
  return {
    weight_goal_kg: toNum(row?.weight_goal_kg),
    muscle_goal_kg: toNum(row?.muscle_goal_kg),
    fat_goal_kg: toNum(row?.fat_goal_kg),
    history: goalHistoryFromJson(row?.weight_goal_history),
  };
}

// 입력 칸 → 목표. 목표 체중은 체중 입력과 같은 규칙(필수), 인바디 목표는 인바디 입력과 같은 규칙(선택)
// 감량 앱이라 목표 체중은 지금 체중(currentKg, 가장 최근 기록)보다 낮아야 한다 (모르면 범위만 본다).
// notLower = 범위 안이지만 지금 체중 이상이라 막음 ("지금 체중보다 낮게 정해 주세요")
export function parseGoalInputs(
  texts: GoalInputTexts,
  currentKg?: number | null
): {
  goal: WeightGoal | null;
  errors: Record<'weight' | BodyCompKind, boolean>;
  notLower: boolean;
} {
  const weight = parseWeightInput(texts.weight);
  const muscle = parseBodyCompInput(texts.muscle, 'muscle');
  const fat = parseBodyCompInput(texts.fat, 'fat');
  const notLower = weight !== null && currentKg != null && weight >= currentKg;
  const errors = {
    weight: weight === null || notLower,
    muscle: muscle === 'invalid',
    fat: fat === 'invalid',
  };
  if (weight === null || notLower || muscle === 'invalid' || fat === 'invalid')
    return { goal: null, errors, notLower };
  return {
    goal: { weight_goal_kg: weight, muscle_goal_kg: muscle, fat_goal_kg: fat },
    errors,
    notLower,
  };
}

// 가장 최근(날짜가 가장 늦은) 기록의 체중. 기록이 없으면 null
export function latestWeight(logs: WeightPoint[]): number | null {
  const latest = logs.reduce<WeightPoint | null>(
    (acc, log) => (!acc || log.day > acc.day ? log : acc),
    null
  );
  return latest ? Number(latest.weight_kg) : null;
}

const toText = (value: number | null) => (value != null ? value.toFixed(1) : '');

// 기존 목표로 채운 입력 칸
export function goalInputTexts(goal: WeightGoal): GoalInputTexts {
  return {
    weight: toText(goal.weight_goal_kg),
    muscle: toText(goal.muscle_goal_kg),
    fat: toText(goal.fat_goal_kg),
  };
}

// 목표까지 진행. 시작 = 직전 목표에 닿은 기록의 체중 (지금 프로그램 안에서), 없으면 프로그램 시작일 이후 첫 기록.
// 지금 = 가장 최근 기록. 기간 안 기록이 없거나 목표가 없으면 null
export function goalProgress(
  logs: WeightPoint[],
  goal: number | null,
  period: GoalPeriod
): GoalProgress | null {
  if (goal === null) return null;
  const inPeriod = weightsInPeriod(logs, period.startDate, { programStart: period.programStart });
  if (inPeriod.length === 0) return null;

  const periodStart = programStartOf(period.programStart, period.startDate);
  const history = (period.history ?? []).filter(
    (item) => !periodStart || item.reached_on >= periodStart
  );
  // 이 목표값을 이미 달성했으면 시작은 그 달성 바로 전 지점, 아니면 마지막 달성 지점
  const ownIndex = history.map((item) => item.goal_kg).lastIndexOf(goal);
  const previous = ownIndex >= 0 ? history[ownIndex - 1] : history[history.length - 1];

  const start = previous ? previous.reached_kg : Number(inPeriod[0].weight_kg);
  const current = Number(inPeriod[inPeriod.length - 1].weight_kg);
  const reached = current <= goal;
  const remaining = Math.max(0, round1(current - goal));
  const percent =
    start > goal
      ? Math.round(Math.min(100, Math.max(0, ((start - current) / (start - goal)) * 100)))
      : reached
        ? 100
        : 0;
  return { goal, start, current, remaining, percent, reached, recorded: ownIndex >= 0 };
}

// "목표까지" 카드 글자
export function goalCardTexts(
  goal: number,
  progress: GoalProgress | null
): { title: string | null; headline: string; detail: string | null } {
  if (!progress) {
    return {
      title: `목표 ${goal.toFixed(1)}kg`,
      headline: '체중을 기록하면 남은 kg을 보여 드려요',
      detail: null,
    };
  }
  const path = `시작 ${progress.start.toFixed(1)}kg → 지금 ${progress.current.toFixed(1)}kg`;
  if (progress.reached) {
    const diff = round1(progress.start - progress.current);
    return {
      title: null,
      headline: `목표 ${goal.toFixed(1)}kg에 닿았어요 🎉`,
      detail: diff > 0 ? `${path} · ${diff.toFixed(1)}kg 줄었어요` : path,
    };
  }
  return {
    title: `목표 ${goal.toFixed(1)}kg까지`,
    headline: `${progress.remaining.toFixed(1)}kg 남았어요`,
    detail: `${path} · ${progress.percent}% 왔어요`,
  };
}

// 카드 아래 인바디 줄. 지금 프로그램 안 인바디 기록이 있을 때만.
// 골격근량: 목표가 있으면 목표 대비, 없으면 "시작할 때보다 줄지 않기" (기간 안 첫 골격근량 기준).
// 체지방량: 목표가 있을 때만
export function inbodyGoalLines(
  logs: (WeightPoint & { muscle_kg?: number | null; fat_kg?: number | null })[],
  goal: Pick<WeightGoal, 'muscle_goal_kg' | 'fat_goal_kg'>,
  period: GoalPeriod
): string[] {
  const inPeriod = weightsInPeriod(logs, period.startDate, { programStart: period.programStart });
  const values = (kind: 'muscle_kg' | 'fat_kg') =>
    inPeriod.map((log) => toNum(log[kind])).filter((v): v is number => v !== null);
  const lines: string[] = [];

  const muscles = values('muscle_kg');
  if (muscles.length > 0) {
    const now = muscles[muscles.length - 1];
    const label = `골격근량 ${now.toFixed(1)}kg`;
    if (goal.muscle_goal_kg !== null) {
      lines.push(
        now >= goal.muscle_goal_kg
          ? `${label} · 목표 이상 유지 중`
          : `${label} · 목표 ${goal.muscle_goal_kg.toFixed(1)}kg까지 ${round1(goal.muscle_goal_kg - now).toFixed(1)}kg`
      );
    } else {
      const first = muscles[0];
      lines.push(
        now >= first
          ? `${label} · 시작 때보다 줄지 않고 유지 중`
          : `${label} · 시작 때보다 ${round1(first - now).toFixed(1)}kg 줄었어요`
      );
    }
  }

  const fats = values('fat_kg');
  if (fats.length > 0 && goal.fat_goal_kg !== null) {
    const now = fats[fats.length - 1];
    const label = `체지방량 ${now.toFixed(1)}kg`;
    lines.push(
      now <= goal.fat_goal_kg
        ? `${label} · 목표에 닿았어요`
        : `${label} · 목표 ${goal.fat_goal_kg.toFixed(1)}kg까지 ${round1(now - goal.fat_goal_kg).toFixed(1)}kg`
    );
  }
  return lines;
}

// 체중을 저장한 직후 같은 창에서 목표를 물을지. 처음 기록(저장 전 기록 0건)이고, 목표를 제대로 읽었는데
// 없고(읽기 실패·마이그레이션 전이면 'unknown'), 이 기기에서 건너뛴 적이 없을 때만
export function shouldAskGoalAfterSave(q: {
  hadLogsBefore: boolean | undefined;
  goalStatus: 'none' | 'set' | 'unknown';
  skipped: boolean;
}): boolean {
  return q.hadLogsBefore === false && q.goalStatus === 'none' && !q.skipped;
}

// 지금 체중이 목표에 닿았고 이 목표값이 아직 달성 기록에 없으면 추가할 항목 (= 축하할 때). 아니면 null
export function goalHistoryEntryToAdd(
  progress: GoalProgress | null,
  currentDay: string | null
): GoalHistoryItem | null {
  if (!progress || !currentDay || !progress.reached) return null;
  if (progress.recorded) return null;
  return { goal_kg: progress.goal, reached_on: currentDay, reached_kg: progress.current };
}

// 달성 기록에 추가 (같은 목표값·같은 날은 한 번만), 날짜순
export function appendGoalHistory(
  history: GoalHistoryItem[],
  item: GoalHistoryItem
): GoalHistoryItem[] {
  if (history.some((h) => h.goal_kg === item.goal_kg && h.reached_on === item.reached_on))
    return history;
  return [...history, item].sort(byReachedOn);
}

// 그래프 달성 표시: 닿은 날 → "✓ 72kg 달성". 같은 날 여러 목표면 가장 낮은 목표
export function goalMarks(history: GoalHistoryItem[]): Record<string, string> {
  const lowest: Record<string, number> = {};
  history.forEach(({ goal_kg, reached_on }) => {
    if (lowest[reached_on] === undefined || goal_kg < lowest[reached_on])
      lowest[reached_on] = goal_kg;
  });
  return Object.fromEntries(
    Object.entries(lowest).map(([day, goal]) => [day, `✓ ${round1(goal)}kg 달성`])
  );
}

// 목표 달성 축하 글자
export function goalCelebrationTexts(
  item: GoalHistoryItem,
  start: number
): { title: string; message: string } {
  return {
    title: `목표 ${item.goal_kg.toFixed(1)}kg에 닿았어요!`,
    message: `시작 ${start.toFixed(1)}kg에서 ${round1(start - item.reached_kg).toFixed(1)}kg 줄었어요`,
  };
}
