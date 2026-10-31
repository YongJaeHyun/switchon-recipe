// 카톡 메시지 버튼으로 앱을 연 주소(switchon-recipe://kakaolink?recipe=… 또는 kakao{앱키}://kakaolink?…)를
// 어디로 보낼지 (순수). app/kakaolink가 쓴다.
// 로그인·온보딩 전인 사람은 시작 화면(app/index)으로 보내고 목적지는 미뤄 둔다
// (stores/notificationGateStore afterLoginHref → hooks/useNotificationObserver가 탭이 뜬 뒤 연다)

export type KakaoLinkTarget = { type: 'recipe'; recipe: string };

export interface KakaoLinkRoute {
  href: string; // 지금 갈 곳
  afterLoginHref: string | null; // 로그인·온보딩을 마친 뒤 열 곳
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

  let recipe: string | null;
  try {
    recipe = parsed.searchParams.get('recipe');
  } catch {
    return null;
  }
  if (!recipe || !isOpenableRecipe(recipe)) return null;
  return { type: 'recipe', recipe };
}

export const recipeDetailHref = (recipe: string) =>
  `/recipeDetail?recipe=${encodeURIComponent(recipe)}`;

const targetHref = (target: KakaoLinkTarget) => recipeDetailHref(target.recipe);

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
  if (isLoggedIn && isOnboarded) return { href: targetHref(target), afterLoginHref: null };
  return { href: '/', afterLoginHref: targetHref(target) };
}
