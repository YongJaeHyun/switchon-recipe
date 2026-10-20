// 재료 이름 정규화: 레시피 재료("닭가슴살 (껍질 제거)", "닭 가슴살", "다진 마늘")를
// 등록 재료(ingredient 테이블)의 이름으로 맞춘다. 맞춤 추천의 제외·필수 재료 비교에 쓴다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 import를 두지 않는다.

export interface RegisteredIngredient {
  name: string;
  sub_keywords: string[];
}

// 괄호(반각·전각) 안 설명과 모든 공백을 뗀다
const strip = (raw: string) => raw.replace(/\([^)]*\)|（[^）]*）/g, '').replace(/\s+/g, '');

// 괄호·공백을 뗀 뒤, 등록 이름이나 sub_keyword(공백 제거) 중 부분 문자열로 들어 있는 가장 긴 것의
// 등록 이름(공백 제거)을 돌려준다. 맞는 것이 없으면 뗀 문자열 그대로.
export function buildIngredientNormalizer(
  registered: RegisteredIngredient[]
): (raw: string) => string {
  const keys: { key: string; name: string }[] = [];
  for (const r of registered) {
    const name = strip(r.name);
    if (!name) continue;
    for (const k of [r.name, ...(r.sub_keywords ?? [])]) {
      const key = strip(k);
      if (key) keys.push({ key, name });
    }
  }
  keys.sort((a, b) => b.key.length - a.key.length);

  return (raw: string) => {
    const s = strip(raw);
    const hit = keys.find((k) => s.includes(k.key));
    return hit ? hit.name : s;
  };
}
