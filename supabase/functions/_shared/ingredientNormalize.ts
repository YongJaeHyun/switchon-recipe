// 재료 이름 정규화: 레시피 재료("닭가슴살 (껍질 제거)", "닭 가슴살", "다진 마늘")를
// 등록 재료(ingredient 테이블)의 이름으로 맞춘다. 맞춤 추천의 필수 재료 비교(정확 일치)와
// 제외 재료 거르기(포함 여부)에 쓴다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 import를 두지 않는다.

export interface RegisteredIngredient {
  name: string;
  sub_keywords: string[];
}

// 소문자 + 모든 공백 제거 (괄호는 그대로)
const compact = (raw: string) => raw.toLowerCase().replace(/\s+/g, '');

// 괄호(반각·전각) 안 설명을 떼고 소문자·공백 제거
const strip = (raw: string) => compact(raw.replace(/\([^)]*\)|（[^）]*）/g, ''));

interface Registry {
  // 긴 것부터 정렬된 (키 → 등록 이름) 목록
  keys: { key: string; name: string }[];
  // 등록 이름 → 그 이름과 sub_keyword 키들
  keysByName: Map<string, string[]>;
}

const buildRegistry = (registered: RegisteredIngredient[]): Registry => {
  const keys: { key: string; name: string }[] = [];
  const keysByName = new Map<string, string[]>();
  for (const r of registered) {
    const name = strip(r.name);
    if (!name) continue;
    for (const k of [r.name, ...(r.sub_keywords ?? [])]) {
      const key = strip(k);
      if (!key) continue;
      keys.push({ key, name });
      keysByName.set(name, [...(keysByName.get(name) ?? []), key]);
    }
  }
  keys.sort((a, b) => b.key.length - a.key.length);
  return { keys, keysByName };
};

const canonical = (registry: Registry, raw: string) => {
  const s = strip(raw);
  const hit = registry.keys.find((k) => s.includes(k.key));
  return hit ? hit.name : s;
};

// 괄호·공백을 떼고 소문자로 바꾼 뒤, 등록 이름이나 sub_keyword(같은 처리) 중 부분 문자열로 들어 있는
// 가장 긴 것의 등록 이름을 돌려준다. 맞는 것이 없으면 처리한 문자열 그대로.
export function buildIngredientNormalizer(
  registered: RegisteredIngredient[]
): (raw: string) => string {
  const registry = buildRegistry(registered);
  return (raw: string) => canonical(registry, raw);
}

// 제외 재료 거르기 (포함 여부, 덜 거르는 것보다 더 거르는 쪽이 안전).
// 레시피 재료 문자열(소문자·공백 제거, 괄호 안 내용은 유지)에 제외어(괄호·공백 제거)나,
// 제외어가 등록 재료로 맞춰지면 그 등록 이름·sub_keyword 중 하나라도 들어 있으면 레시피를 뺀다.
export function excludeByContainment<T extends { ingredients: { name: string }[] }>(
  rows: T[],
  excludeTerms: string[],
  registered: RegisteredIngredient[]
): T[] {
  const registry = buildRegistry(registered);
  const needles = new Set<string>();
  for (const term of excludeTerms) {
    const s = strip(term);
    if (!s) continue;
    needles.add(s);
    for (const key of registry.keysByName.get(canonical(registry, term)) ?? []) needles.add(key);
  }
  if (needles.size === 0) return rows;
  const list = [...needles];
  return rows.filter(
    (r) =>
      !r.ingredients.some((i) => {
        const hay = compact(i.name);
        return list.some((n) => hay.includes(n));
      })
  );
}
