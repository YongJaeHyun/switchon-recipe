import { describe, expect, it } from 'vitest';
import { orEmptyArray } from './stableDefaults';

describe('orEmptyArray', () => {
  it('returns the same empty array reference while data is missing', () => {
    // 렌더마다 새 [] 를 만들면 이를 의존성으로 쓰는 useEffect가 무한 반복됨
    expect(orEmptyArray<number>(undefined)).toBe(orEmptyArray<number>(undefined));
    expect(orEmptyArray<number>(null)).toBe(orEmptyArray<number>(undefined));
  });

  it('returns the data itself when present', () => {
    const data = [1, 2];
    expect(orEmptyArray(data)).toBe(data);
  });
});
