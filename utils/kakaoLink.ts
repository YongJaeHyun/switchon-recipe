// 카톡 메시지 버튼으로 앱을 연 주소(switchon-recipe://kakaolink?recipe=… 또는 kakao{앱키}://kakaolink?…)를
// 어디로 보낼지 (순수). app/kakaolink가 쓴다.
// 로그인·온보딩 전인 사람은 시작 화면(app/index)으로 보내고 목적지는 미뤄 둔다
// (stores/notificationGateStore afterLoginHref → hooks/useNotificationObserver가 탭이 뜬 뒤 연다)
// 같이 하자 초대(invite=시작일)는 이동 대신 시작일을 넘긴다: 새 사용자는 온보딩이 친구 시작일을 선택지로 보이고,
// 이미 시작한 사람은 탭이 뜬 뒤 안내만 한다 (stores/notificationGateStore pendingInvite)

import { isDayString } from './kakaoShare';

export type KakaoLinkTarget =
  | { type: 'recipe'; recipe: string }
  | { type: 'invite'; startDate: string };

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

// 레시피 상세 화면(app/recipeDetail)이 JSON.parse로 여는 칸들이 다 멀쩡한지
const RECIPE_JSON_FIELDS = ['ingredients', 'cooking_steps', 'nutrition'] as const;
const isOpenableRecipe = (recipe: string) => {
  const parsed = parseJson(recipe);
  if (!isObject(parsed) || typeof parsed.id !== 'number') return false;
  return RECIPE_JSON_FIELDS.every(
    (field) => typeof parsed[field] === 'string' && parseJson(parsed[field]) !== undefined
  );
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
  return null;
}

export const recipeDetailHref = (recipe: string) =>
  `/recipeDetail?recipe=${encodeURIComponent(recipe)}`;

const targetHref = (target: Extract<KakaoLinkTarget, { type: 'recipe' }>) =>
  recipeDetailHref(target.recipe);

export function kakaoLinkRoute({
  target,
  isLoggedIn,
  isOnboarded,
}: {
  target: KakaoLinkTarget | null;
  isLoggedIn: boolean;
  isOnboarded: boolean | null | undefined;
}): KakaoLinkRoute {
  // 깨진 주소: 시작 화면이 로그인 여부에 따라 홈·로그인으로 보낸다
  if (!target) return { href: '/', afterLoginHref: null };
  const ready = isLoggedIn && !!isOnboarded;
  if (target.type === 'invite') {
    return { href: ready ? '/(tabs)/home' : '/', afterLoginHref: null, invite: target.startDate };
  }
  if (ready) return { href: targetHref(target), afterLoginHref: null };
  return { href: '/', afterLoginHref: targetHref(target) };
}
