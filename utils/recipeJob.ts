import { josa } from 'es-hangul';
import type { RecipeDB } from 'types/database';
import type { QuotaExceeded } from 'types/recipeQuota';

// 레시피 만들기는 화면과 상관없이 뒤에서 돈다 (운영자 결정 2026-11-01). 한 번에 하나만.
// 여기는 순수 상태 전이와 띠 문구만: 실제 요청은 services/recipeJobRunner, 상태 보관은 stores/recipeJobStore

// input: 같은 요청을 다시 보내거나(광고 보상 뒤) 시트를 다시 여는 데 쓰는 원래 요청 (모양은 러너가 정한다)
export type RecipeJob =
  | { phase: 'idle' }
  | {
      phase: 'running';
      id: number;
      label: string;
      origin: string;
      input: unknown;
      // 시작 시각(ms): 진행 막대·남은 시간
      startedAt: number;
    }
  | { phase: 'done'; id: number; recipe: RecipeDB; origin: string }
  | { phase: 'error'; id: number }
  | { phase: 'quota'; id: number; quota: QuotaExceeded; origin: string; input: unknown }
  | { phase: 'rejected'; id: number; message: string; origin: string; input: unknown }
  | { phase: 'locked'; id: number };

export interface RecipeJobState {
  job: RecipeJob;
  lastId: number;
}

// silent: 취소 등 알릴 것이 없을 때
export type RecipeJobResult =
  | { type: 'done'; recipe: RecipeDB }
  | { type: 'error' }
  | { type: 'quota'; quota: QuotaExceeded }
  | { type: 'rejected'; message: string }
  | { type: 'locked' }
  | { type: 'silent' };

export const initialRecipeJobState: RecipeJobState = { job: { phase: 'idle' }, lastId: 0 };

export const isRecipeJobBusy = (state: RecipeJobState) => state.job.phase === 'running';

// 도는 중이면 null (두 번 누르기 막기). 끝난 띠가 남아 있으면 새 작업이 덮는다
export const startRecipeJob = (
  state: RecipeJobState,
  {
    label,
    origin,
    input,
    startedAt = Date.now(),
  }: { label: string; origin: string; input: unknown; startedAt?: number }
): { state: RecipeJobState; id: number } | null => {
  if (isRecipeJobBusy(state)) return null;
  const id = state.lastId + 1;
  return {
    id,
    state: { lastId: id, job: { phase: 'running', id, label, origin, input, startedAt } },
  };
};

export const finishRecipeJob = (
  state: RecipeJobState,
  id: number,
  result: RecipeJobResult
): RecipeJobState => {
  const { job } = state;
  if (job.phase !== 'running' || job.id !== id) return state;
  const { origin, input } = job;
  const next = (j: RecipeJob): RecipeJobState => ({ ...state, job: j });
  switch (result.type) {
    case 'done':
      return next({ phase: 'done', id, recipe: result.recipe, origin });
    case 'error':
      return next({ phase: 'error', id });
    case 'quota':
      return next({ phase: 'quota', id, quota: result.quota, origin, input });
    case 'rejected':
      return next({ phase: 'rejected', id, message: result.message, origin, input });
    case 'locked':
      return next({ phase: 'locked', id });
    case 'silent':
      return next({ phase: 'idle' });
  }
};

export const dismissRecipeJob = (state: RecipeJobState): RecipeJobState =>
  state.job.phase === 'idle' || isRecipeJobBusy(state)
    ? state
    : { ...state, job: { phase: 'idle' } };

// 로그아웃·계정이 바뀌면 도는 중이어도 비운다. lastId는 남겨 그 작업의 늦은 결과가 다음 작업을 건드리지 않게 한다
export const resetRecipeJob = (state: RecipeJobState): RecipeJobState => ({
  lastId: state.lastId,
  job: { phase: 'idle' },
});

// 띠를 숨기는 화면 (expo-router segments): 로그인 전·첫 안내, 그리고 아래에 고정 버튼이 있어 띠가 가리는 화면
// (패스 결제의 구매 버튼, 문의 쓰기의 제출하기)
export const isRecipeJobBandHidden = (segments: readonly string[]) => {
  const [first, second] = segments;
  if (!first || first === 'index') return true;
  if (first === '(auth)' || first === '(greet)' || first === 'pass') return true;
  return first === '(inquiry)' && second === 'new';
};

// 완성됐을 때 시작한 화면을 아직 보고 있으면 띠 대신 바로 레시피로
export const shouldOpenOnDone = (state: RecipeJobState, focusedOrigins: readonly string[]) =>
  state.job.phase === 'done' && focusedOrigins.includes(state.job.origin);

export interface RecipeJobBand {
  tone: 'running' | 'done' | 'error' | 'warn';
  title: string;
  // 눌러서 할 일 (null이면 누를 것 없음)
  action: string | null;
  dismissible: boolean;
}

export const recipeJobBand = ({ job }: RecipeJobState): RecipeJobBand | null => {
  switch (job.phase) {
    case 'idle':
      return null;
    case 'running':
      return { tone: 'running', title: job.label, action: null, dismissible: false };
    case 'done': {
      const name = job.recipe.recipe_name?.trim();
      return {
        tone: 'done',
        title: name ? `✅ ${name} 완성!` : '✅ 레시피 완성!',
        action: '보러 가기 ›',
        dismissible: true,
      };
    }
    case 'error':
      return {
        tone: 'error',
        title: '레시피를 만들지 못했어요. 다시 해 주세요',
        action: null,
        dismissible: true,
      };
    case 'quota':
      return {
        tone: 'warn',
        title: '오늘 만들 수 있는 레시피를 다 썼어요',
        action: '자세히 ›',
        dismissible: true,
      };
    case 'rejected':
      return { tone: 'warn', title: job.message, action: '이름 고치기 ›', dismissible: true };
    case 'locked':
      return {
        tone: 'warn',
        title: '무료 체험을 모두 썼어요',
        action: '패스 보기 ›',
        dismissible: true,
      };
  }
};

const NAMES_SHOWN = 2;

export type RecipeJobLabelInput =
  | { kind: 'ingredients' | 'recommend'; names: readonly string[]; isZeroCarb: boolean }
  | { kind: 'byName'; name: string };

// 만드는 중 띠 문구 (운영자 결정): 재료는 2개까지 이름, 더 있으면 "외 N개", 끝말에 맞는 으로/로
export const recipeJobLabel = (input: RecipeJobLabelInput): string => {
  if (input.kind === 'byName') return `🍳 ${input.name} 만드는 중…`;
  const carb = input.isZeroCarb ? '무탄수' : '저탄수';
  const names = input.names.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    return input.kind === 'recommend'
      ? '🍳 맞춤 레시피 만드는 중…'
      : `🍳 ${carb} 레시피 만드는 중…`;
  }
  const shown = names.slice(0, NAMES_SHOWN).join('·');
  const rest = names.length - NAMES_SHOWN;
  const phrase = rest > 0 ? `${shown} 외 ${rest}개` : shown;
  return `🍳 ${josa(phrase, '으로/로')} ${carb} 레시피 만드는 중…`;
};

// 레시피 하나 만드는 데 걸리는 예상 시간 (보통 20~40초)
export const RECIPE_JOB_EXPECTED_MS = 30 * 1000;
const PROGRESS_CAP = 0.9;

// 만드는 중 막대: 예상 시간까지 처음은 빠르고 끝은 느리게 90%까지 차고, 끝날 때까지 90%에 머문다
// (다 되면 띠가 100%로 채운 뒤 완성으로 바뀐다)
export const recipeJobProgress = (elapsedMs: number, expectedMs = RECIPE_JOB_EXPECTED_MS) => {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const t = Math.min(elapsedMs / expectedMs, 1);
  return PROGRESS_CAP * (1 - (1 - t) ** 3);
};

// "약 N초 남음" (5초 단위로 올림). 예상 시간을 넘기면 "거의 다 됐어요"
export const recipeJobRemainingText = (elapsedMs: number, expectedMs = RECIPE_JOB_EXPECTED_MS) => {
  const left = expectedMs - Math.max(elapsedMs, 0);
  if (left <= 0) return '거의 다 됐어요';
  return `약 ${Math.ceil(left / 5000) * 5}초 남음`;
};
