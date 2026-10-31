// 탐색 목록 페이지 합치기. 최신순은 offset으로 다음 페이지를 받으므로, 스크롤하는 사이 새 레시피가 생기면
// 앞 페이지 끝 레시피가 다음 페이지 첫머리에 또 온다 → 같은 id는 처음 것만 (목록 key 중복 방지)
export function flattenRecipePages<T extends { id: number | null }>(pages: T[][] | undefined): T[] {
  const seen = new Set<number | null>();
  const result: T[] = [];
  for (const recipe of pages?.flat() ?? []) {
    if (seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    result.push(recipe);
  }
  return result;
}
