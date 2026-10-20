import { describe, expect, it } from 'vitest';
import { isQuotaExceeded } from './recipeQuota';

describe('isQuotaExceeded', () => {
  it('한도 초과 객체는 true', () => {
    expect(isQuotaExceeded({ quotaExceeded: true, canWatchAd: true, isPass: false })).toBe(true);
  });
  it('레시피, null, undefined는 false', () => {
    expect(isQuotaExceeded({ id: 1, recipe_name: 'a' })).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
    expect(isQuotaExceeded(undefined)).toBe(false);
  });
});
