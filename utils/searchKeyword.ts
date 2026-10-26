// 재료 이름에서 검색어만 남긴다: 괄호 속 부가 설명('현미밥 (지은 밥)' → '현미밥')을 빼고 공백을 정리한다.
// 괄호 설명뿐인 이름이면 검색어가 없다 ('')
export function searchKeywordOf(name: string): string {
  return name
    .replace(/[(（][^)）]*[)）]?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 정리한 검색어 목록에서 빈 말은 빼고 같은 말은 처음 것만 남긴다 (인기 카테고리 등)
export function uniqueSearchKeywords(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const keyword = searchKeywordOf(name);
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    result.push(keyword);
  }
  return result;
}
