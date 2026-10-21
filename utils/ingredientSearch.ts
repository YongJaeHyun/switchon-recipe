import { getChoseong } from 'es-hangul';
import { isCompletedHangul } from './hangul';

// 재료 검색 (low/zero 제작 화면, 맞춤 추천 재료 고르기).
// 완성형 한글이면 이름·하위 키워드에 포함되는지, 아니면 초성으로 비교한다. 빈 검색어면 목록 그대로
export function searchIngredients<T extends { name: string; subKeywords?: string[] }>(
  list: T[],
  keyword: string
): T[] {
  const trimmed = keyword.trim();
  if (!trimmed) return list;

  const completed = isCompletedHangul(trimmed);
  const keywordChoseong = completed ? '' : getChoseong(trimmed);

  return list.filter(({ name, subKeywords = [] }) =>
    [...subKeywords, name].some((candidate) =>
      completed ? candidate.includes(trimmed) : getChoseong(candidate).includes(keywordChoseong)
    )
  );
}
