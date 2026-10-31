// 카톡 메시지 버튼으로 앱을 연 주소(switchon-recipe://kakaolink?recipe=… 또는 kakao{앱키}://kakaolink?…)를
// 어디로 보낼지 (순수). app/kakaolink가 쓴다.
// 로그인·온보딩 전인 사람은 시작 화면(app/index)으로 보내고 목적지는 미뤄 둔다
// (stores/notificationGateStore afterLoginHref → hooks/useNotificationObserver가 탭이 뜬 뒤 연다)
// 같이 하자 초대(invite=시작일)는 이동 대신 시작일을 넘긴다: 새 사용자는 온보딩이 친구 시작일을 선택지로 보이고,
// 이미 시작한 사람은 탭이 뜬 뒤 안내만 한다 (stores/notificationGateStore pendingInvite).
// 편의점 판정 결과(foodCheck=1)는 레시피처럼 판정 화면으로, 완주 인증 등 그 밖의 링크는 앱만 연다

import { isDayString } from './kakaoShare';
import type { AppRoutePhase } from './notificationGate';
import { hasRecipeFieldShapes } from './recipeFields';

export type KakaoLinkTarget =
  | { type: 'recipe'; recipe: string }
  | { type: 'invite'; startDate: string }
  // 편의점 판정 결과를 받은 사람: 판정 화면으로 (foodCheck=1)
  | { type: 'foodCheck' }
  // 아는 파라미터가 없는 링크 (완주 인증 share=completion 등): 앱만 연다
  | { type: 'open' };

export interface KakaoLinkRoute {
  href: string; // 지금 갈 곳
  afterLoginHref: string | null; // 로그인·온보딩을 마친 뒤 열 곳
  invite?: string; // 받은 초대의 친구 시작일
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

// 링크로 받는 레시피 JSON 최대 길이 (실제 레시피는 수 KB). 더 길면 만든 링크로 보고 받지 않는다
const MAX_RECIPE_LENGTH = 50_000;

// 레시피 상세 화면(app/recipeDetail)이 여는 칸들의 모양이 맞는지: id 숫자, 재료·조리 순서 배열, 영양 객체
const isOpenableRecipe = (recipe: string) => {
  if (recipe.length > MAX_RECIPE_LENGTH) return false;
  const parsed = parseJson(recipe);
  if (!isObject(parsed) || typeof parsed.id !== 'number') return false;
  return hasRecipeFieldShapes(parsed);
};

export function parseKakaoLink(url: string | null | undefined): KakaoLinkTarget | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url, 'switchon-recipe://');
  } catch {
    return null;
  }
  if (parsed.hostname !== 'kakaolink') return null;

  let params: URLSearchParams;
  try {
    params = parsed.searchParams;
    // 깨진 퍼센트 인코딩은 여기서 던진다
    params.get('recipe');
  } catch {
    return null;
  }

  if (params.has('recipe')) {
    const recipe = params.get('recipe');
    if (!recipe || !isOpenableRecipe(recipe)) return null;
    return { type: 'recipe', recipe };
  }
  if (params.has('invite')) {
    const startDate = params.get('invite');
    return isDayString(startDate) ? { type: 'invite', startDate } : null;
  }
  if (params.has('foodCheck')) return { type: 'foodCheck' };
  return { type: 'open' };
}

export const recipeDetailHref = (recipe: string) =>
  `/recipeDetail?recipe=${encodeURIComponent(recipe)}`;

const FOOD_CHECK_HREF = '/foodCheck';

const targetHref = (target: Extract<KakaoLinkTarget, { type: 'recipe' | 'foodCheck' }>) =>
  target.type === 'recipe' ? recipeDetailHref(target.recipe) : FOOD_CHECK_HREF;

// 바로 이동은 탭이 이미 떠 있을 때만 (앱을 쓰다 링크를 누름). 앱을 막 켠 링크는 로그인했어도 시작 화면(app/index)을
// 거쳐 탭을 띄운 뒤 그 위에 연다: 바로 가면 그 화면 하나만 남아 뒤로 가기가 막히고 시작 준비도 건너뛴다
export function kakaoLinkRoute({
  phase,
  target,
  isLoggedIn,
  isOnboarded,
}: {
  phase: AppRoutePhase;
  target: KakaoLinkTarget | null;
  isLoggedIn: boolean;
  isOnboarded: boolean | null | undefined;
}): KakaoLinkRoute {
  // 깨진 주소·앱만 여는 링크: 시작 화면이 로그인 여부에 따라 홈·로그인으로 보낸다
  if (!target || target.type === 'open') return { href: '/', afterLoginHref: null };
  const ready = phase === 'tabs' && isLoggedIn && !!isOnboarded;
  if (target.type === 'invite') {
    return { href: ready ? '/(tabs)/home' : '/', afterLoginHref: null, invite: target.startDate };
  }
  if (ready) return { href: targetHref(target), afterLoginHref: null };
  return { href: '/', afterLoginHref: targetHref(target) };
}
