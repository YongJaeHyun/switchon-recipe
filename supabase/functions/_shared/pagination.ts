// PostgREST는 한 번에 최대 1000행만 돌려준다. 페이지를 넘겨 가며 전부 읽는 공용 헬퍼.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 import를 두지 않는다.

// 마지막 페이지(pageSize보다 짧은 페이지)까지 읽어 이어 붙인다
export const fetchAllPages = async <T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000
): Promise<T[]> => {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    all.push(...page);
    if (page.length < pageSize) return all;
  }
};
