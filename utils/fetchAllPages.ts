// Supabase는 한 번에 최대 행 수(supabase/config.toml max_rows = 1000)까지만 돌려주고 나머지는 말없이 자른다.
// fetchPage(from, to)는 [from, to] 범위(포함)를 정렬된 순서로 읽는다. 한 쪽보다 적게 오면 끝.
// maxPages: 끝없이 부르지 않게 하는 상한 (기본 20쪽 = 2만 행)
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000,
  maxPages = 20
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const chunk = await fetchPage(from, from + pageSize - 1);
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}
