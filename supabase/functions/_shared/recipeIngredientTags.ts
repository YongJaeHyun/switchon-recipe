// 레시피 검색용 재료 태그: 레시피 재료 문구("현미밥 (지은 밥)", "다진 마늘", "닭고기 (닭가슴살 또는 닭다리살)")에서
// 등록 재료(ingredient 테이블) 이름 목록을 뽑아 recipe.ingredient_tags에 저장한다. 화면에 보이는 재료 문구는 그대로 둔다.
// 맞추기는 맞춤 추천·비슷한 레시피와 같은 정규화(ingredientNormalize.ts)를 쓴다.
//
// 규칙 (재료 항목마다):
// 1. 이름(문자열 항목은 문자열 자체)에서 괄호 설명을 뗀 본 이름을 "또는"·"/"·","·"및" 등으로 나눠 각각 맞춘다.
//    분량("300g", "1/2개", "약간")은 떼고 맞춘다 ("무 300g" → 무).
// 2. 본 이름에서 하나도 맞지 않을 때만 괄호 안을 같은 방법으로 나눠 맞춘다.
//    "닭고기 (닭가슴살 또는 닭다리살)" → 닭가슴살·닭다리살, "파프리카 (빨강/노랑)" → 파프리카만.
//    다만 괄호 안 조각이 쓰임새 설명("닭가슴살 밑간용", "숙주 데칠 때", "간장으로 간이 부족할 경우")이면 쓰지 않는다.
// 3. 기름("~오일", "~유", "~기름")을 가리키는 조각은 맞춘 등록 이름도 기름일 때만 쓴다. "오일"은 "유"로 바꿔 먼저 맞춘다.
//    "올리브 오일" → 올리브유, "아보카도 오일"·"아보카도유" → 없음 (아보카도로 태그하면 검색에서 엉뚱한 레시피가 나온다).
//    본 이름이 기름이면("식용유 (아보카도 또는 코코넛 오일)") 괄호 안 조각도 기름으로 본다.
//    육수는 재료를 실제로 쓰므로 막지 않는다: "다시마 육수" → 다시마, "육수 (멸치 다시마 또는 닭 육수)" → 다시마.
// 4. 선택 재료도 포함하고, 양념(마늘·간장 등)도 등록돼 있으면 포함한다 (검색 대상이므로).
// 결과는 등록 이름 원문(예: "껍질콩(그린빈)"), 중복 없이 코드 포인트 순 정렬 (런타임마다 같은 결과).
// Deno 엣지 함수와 Vitest(node)·Node 스크립트에서 로드되므로 이 파일 밖 의존은 ingredientNormalize.ts뿐이다.

import {
  buildIngredientNormalizer,
  ingredientKey,
  type RegisteredIngredient,
} from './ingredientNormalize.ts';

// 재료 문구 → 등록 이름 원문, 맞는 것이 없으면 null
export type IngredientTagMatcher = (raw: string) => string | null;

export function buildIngredientTagMatcher(
  registered: RegisteredIngredient[]
): IngredientTagMatcher {
  const normalize = buildIngredientNormalizer(registered);
  // 정규화 결과(괄호·공백 뗀 소문자 등록 이름) → 등록 이름 원문 (같은 키면 먼저 나온 것)
  const original = new Map<string, string>();
  for (const r of registered) {
    const key = ingredientKey(r.name);
    if (key && !original.has(key)) original.set(key, r.name.trim());
  }
  return (raw) => {
    if (!ingredientKey(raw)) return null;
    return original.get(normalize(raw)) ?? null;
  };
}

// 기름을 가리키는 문구: "오일"·"oil"이 들어 있거나 "유"·"기름"으로 끝난다 (식용유, 올리브유, 냉압착 들기름).
// "우유"로 끝나는 것은 기름이 아니다 (아몬드 우유)
const OIL_WORD = /오일|oil/gi;
const isOil = (s: string) => {
  const c = s.toLowerCase().replace(/\s+/g, '');
  return /오일|oil/.test(c) || (/(유|기름)$/.test(c) && !c.endsWith('우유'));
};
// 괄호 안 쓰임새 설명 ("밑간용", "소스용 ", "데칠 때", "부족할 경우", "다시마 우린 물")
const USAGE = /용(?:\s|$)|때|경우|우린|제조/;

const SEPARATOR = /\s*(?:또는|혹은|및|\/|,|，|、|·|&|\+)\s*|\s+or\s+/i;
const PAREN = /\(([^)]*)\)|（([^）]*)）/g;
// 숫자로 시작하는 분량 토큰과 분량 낱말
const AMOUNT =
  /(?:^|\s)(?:약\s*)?[\d½¼¾⅓⅔][\d.,/~½¼¾⅓⅔-]*\s*[a-zA-Z가-힣]{0,3}(?=\s|$)|(?:^|\s)(?:약간|적당량|적당히|조금|소량|한\s*줌|한\s*꼬집)(?=\s|$)/g;

// 이름 → (괄호 밖 본 이름, 괄호 안 내용들). 닫히지 않은 괄호 뒤는 괄호 안으로 본다
const splitParens = (name: string): { main: string; inner: string[] } => {
  const inner: string[] = [];
  let main = name.replace(PAREN, (_, a, b) => {
    inner.push(a ?? b ?? '');
    return ' ';
  });
  const open = main.search(/[(（]/);
  if (open >= 0) {
    inner.push(main.slice(open + 1));
    main = main.slice(0, open);
  }
  return { main, inner };
};

const matchPart = (part: string, oilContext: boolean, matcher: IngredientTagMatcher) => {
  if (!oilContext && !isOil(part)) return matcher(part);
  const name = matcher(part.replace(OIL_WORD, '유')) ?? matcher(part);
  return name && isOil(name) ? name : null;
};

interface PartOptions {
  oilContext: boolean;
  skipUsage: boolean;
}

const matchParts = (text: string, matcher: IngredientTagMatcher, opts: PartOptions): string[] => {
  const found: string[] = [];
  for (const part of text.split(SEPARATOR)) {
    const cleaned = part.replace(AMOUNT, ' ').trim();
    if (!cleaned) continue;
    if (opts.skipUsage && USAGE.test(cleaned)) continue;
    const name = matchPart(cleaned, opts.oilContext, matcher);
    if (name) found.push(name);
  }
  return found;
};

const tagsOfName = (name: string, matcher: IngredientTagMatcher): string[] => {
  const { main, inner } = splitParens(name);
  const fromMain = matchParts(main, matcher, { oilContext: false, skipUsage: false });
  if (fromMain.length > 0) return fromMain;
  const oilContext = isOil(main.replace(AMOUNT, ' ').trim());
  return inner.flatMap((text) => matchParts(text, matcher, { oilContext, skipUsage: true }));
};

// 재료 JSON(문자열 배열 또는 {name, isOptional, amount} 배열) → 등록 재료 이름 목록
export function ingredientTagsFor(
  ingredientsJson: string | null,
  matcher: IngredientTagMatcher
): string[] {
  if (!ingredientsJson) return [];
  let items: unknown;
  try {
    items = JSON.parse(ingredientsJson);
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  const tags = new Set<string>();
  for (const it of items) {
    const name =
      typeof it === 'string'
        ? it
        : it && typeof it === 'object' && typeof (it as { name?: unknown }).name === 'string'
          ? (it as { name: string }).name
          : null;
    if (!name) continue;
    for (const tag of tagsOfName(name, matcher)) tags.add(tag);
  }
  return [...tags].sort();
}

// 레시피 생성용: 등록 재료를 읽어 태그를 만든다. 읽기에 실패해도 레시피 생성을 막지 않도록 []를 돌려주고 로그만 남긴다
// (빠진 태그는 scripts/backfillIngredientTags.ts로 다시 채운다)
export async function loadIngredientTags(
  fetchRegistered: () => Promise<RegisteredIngredient[]>,
  ingredientsJson: string,
  log: (...args: unknown[]) => void = console.error
): Promise<string[]> {
  try {
    const registered = await fetchRegistered();
    return ingredientTagsFor(ingredientsJson, buildIngredientTagMatcher(registered));
  } catch (err) {
    log('재료 태그 계산 실패 (빈 태그로 저장):', err);
    return [];
  }
}

export const sameTags = (a: readonly string[] | null, b: readonly string[] | null) => {
  const x = new Set(a ?? []);
  const y = new Set(b ?? []);
  return x.size === y.size && [...x].every((t) => y.has(t));
};

export interface TagBackfillRow {
  id: number;
  ingredients: string | null;
  ingredient_tags: string[] | null;
}

export interface TagUpdate {
  id: number;
  before: string[];
  tags: string[];
}

// 백필용: 새로 계산한 태그가 지금 저장된 것과 다른 행만
export function planIngredientTagUpdates(
  rows: TagBackfillRow[],
  matcher: IngredientTagMatcher
): TagUpdate[] {
  const updates: TagUpdate[] = [];
  for (const row of rows) {
    const tags = ingredientTagsFor(row.ingredients, matcher);
    if (!sameTags(row.ingredient_tags, tags)) {
      updates.push({ id: row.id, before: row.ingredient_tags ?? [], tags });
    }
  }
  return updates;
}
