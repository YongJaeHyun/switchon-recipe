export const fileNameFromUri = (uri: string | null | undefined) =>
  uri?.split('/').pop()?.split('?')[0] || null;

export const findUnusedFiles = (fileNames: string[], usedUris: (string | null)[]) => {
  const used = new Set(usedUris.map(fileNameFromUri).filter(Boolean));
  return fileNames.filter((name) => !used.has(name));
};

// PostgREST는 한 번에 최대 1000행만 돌려줌. 레시피가 1000개를 넘어도 사용 중인 이미지를 지우지 않도록 전부 읽음
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
