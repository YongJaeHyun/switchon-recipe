const EMPTY_ARRAY: readonly never[] = Object.freeze([]);

// 쿼리 데이터가 없을 때 렌더마다 새 [] 를 만들지 않도록 같은 빈 배열을 돌려줌
export const orEmptyArray = <T>(data: T[] | null | undefined): T[] =>
  data ?? (EMPTY_ARRAY as unknown as T[]);
