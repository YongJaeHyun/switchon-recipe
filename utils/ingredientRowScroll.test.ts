import { describe, expect, it } from 'vitest';
import { rowScrollState } from './ingredientRowScroll';

describe('rowScrollState', () => {
  it('아직 재지 못했으면 넘치지 않은 것으로 본다', () => {
    expect(rowScrollState({ contentWidth: 0, viewportWidth: 0, offset: 0 })).toEqual({
      overflows: false,
      atEnd: true,
    });
  });

  it('내용이 화면 폭 이하면 넘치지 않는다 (1px 오차 허용)', () => {
    expect(rowScrollState({ contentWidth: 350, viewportWidth: 350, offset: 0 }).overflows).toBe(
      false
    );
    expect(rowScrollState({ contentWidth: 350.6, viewportWidth: 350, offset: 0 }).overflows).toBe(
      false
    );
  });

  it('내용이 더 넓고 처음이면 오른쪽에 더 있다', () => {
    expect(rowScrollState({ contentWidth: 900, viewportWidth: 350, offset: 0 })).toEqual({
      overflows: true,
      atEnd: false,
    });
  });

  it('끝까지 넘기면 끝 (소수점 오차 허용)', () => {
    expect(rowScrollState({ contentWidth: 900, viewportWidth: 350, offset: 550 }).atEnd).toBe(true);
    expect(rowScrollState({ contentWidth: 900, viewportWidth: 350, offset: 549.2 }).atEnd).toBe(
      true
    );
    expect(rowScrollState({ contentWidth: 900, viewportWidth: 350, offset: 540 }).atEnd).toBe(
      false
    );
  });

  it('넘쳐 튕긴 위치(끝보다 큰 값)도 끝', () => {
    expect(rowScrollState({ contentWidth: 900, viewportWidth: 350, offset: 600 }).atEnd).toBe(true);
  });
});
