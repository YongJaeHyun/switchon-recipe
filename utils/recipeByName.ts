// 먹고 싶은 음식 이름으로 레시피 만들기 (패스 기능) 표시·응답 해석용 순수 함수.
// 서버(create-recipe-by-name)가 최종 판단하고, 무료 횟수는 get-pass-status의 recipeByNameTrialRemaining을 참고만 한다
import type { RecipeDB } from 'types/database';
import type { PassStatus } from 'types/pass';
import type { QuotaExceeded } from 'types/recipeQuota';
import { type TrialEntryState, trialEntryState } from './passTrial';
import { quotaExceededFromBody } from './recipeQuota';

// 서버 _shared/recipeNameCheck.ts와 같은 값
export const RECIPE_BY_NAME_TRIAL_LIMIT = 3;
export const DISH_NAME_MAX = 30;

export const RECIPE_BY_NAME_TITLE = '먹고 싶은 음식으로 만들기';
export const RECIPE_BY_NAME_DESCRIPTION =
  '“김치찌개”처럼 이름만 적으면 스위치온식 레시피로 만들어 드려요';
export const ADAPT_NOTE_TITLE = '원래 음식에서 이렇게 바꿨어요';

const DEFAULT_REJECT_MESSAGE = '레시피로 만들 수 없는 이름이에요';
const DEFAULT_LIMIT_MESSAGE = '오늘은 더 확인할 수 없어요. 내일 다시 해 주세요';
const ERROR_MESSAGE = '레시피를 만들지 못했어요. 잠시 후 다시 시도해 주세요';
const INVALID_FALLBACK = '음식 이름을 확인해 주세요';

export function recipeByNameEntryState(
  status: PassStatus | undefined,
  billingAvailable: boolean | undefined
): TrialEntryState {
  return trialEntryState(status, billingAvailable, status?.recipeByNameTrialRemaining);
}

// 입력 중 정리: 따옴표·줄바꿈 같은 글자를 지우고 최대 길이까지 (서버도 같은 규칙으로 다시 정리한다).
// 띄어쓰기를 칠 수 있게 끝 공백은 남긴다 (보낼 때 trim)
export function cleanDishNameInput(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/["'`“”‘’\\<>{}]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, DISH_NAME_MAX);
}

const LABEL_KEYWORD_MAX = 10;

// 탐색 결과 없음 버튼 문구
export function suggestionLabel(keyword: string): string {
  const word = keyword.trim();
  const short = word.length > LABEL_KEYWORD_MAX ? `${word.slice(0, LABEL_KEYWORD_MAX)}…` : word;
  return `“${short}” 레시피 만들기`;
}

export type RecipeByNameVerdict = 'ok' | 'adapt';

export type RecipeByNameOutcome =
  | { status: 'ok'; recipe: RecipeDB; verdict: RecipeByNameVerdict; trialRemaining?: number }
  | { status: 'rejected'; message: string }
  | { status: 'nameCheckLimit'; message: string }
  | { status: 'quotaExceeded'; quota: QuotaExceeded }
  | { status: 'locked' }
  | { status: 'invalid'; message: string }
  | { status: 'error'; message: string };

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const text = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

export function interpretRecipeByNameResponse(status: number, body: unknown): RecipeByNameOutcome {
  const b = asObject(body);

  if (status === 200) {
    const recipe = asObject(b?.recipe);
    if (b?.status === 'ok' && recipe && typeof recipe.id === 'number') {
      const verdict: RecipeByNameVerdict = b.verdict === 'adapt' ? 'adapt' : 'ok';
      const outcome: RecipeByNameOutcome = {
        status: 'ok',
        recipe: recipe as unknown as RecipeDB,
        verdict,
      };
      return typeof b.trialRemaining === 'number'
        ? { ...outcome, trialRemaining: b.trialRemaining }
        : outcome;
    }
    if (b?.status === 'rejected') {
      return { status: 'rejected', message: text(b.reason, DEFAULT_REJECT_MESSAGE) };
    }
    return { status: 'error', message: ERROR_MESSAGE };
  }
  if (status === 429) {
    if (b?.code === 'NAME_CHECK_LIMIT') {
      return { status: 'nameCheckLimit', message: text(b.error, DEFAULT_LIMIT_MESSAGE) };
    }
    return { status: 'quotaExceeded', quota: quotaExceededFromBody(b) };
  }
  if (status === 402) return { status: 'locked' };
  if (status === 400) return { status: 'invalid', message: text(b?.error, INVALID_FALLBACK) };
  return { status: 'error', message: ERROR_MESSAGE };
}

// recipe.adapt_note(줄바꿈 구분) → 안내 줄. 없으면 빈 배열 (옛 레시피·ok 레시피)
export function adaptNoteLines(note: unknown): string[] {
  if (typeof note !== 'string') return [];
  return note
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 2);
}
