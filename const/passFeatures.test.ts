import { describe, expect, it } from 'vitest';
import { PASS_FEATURES, passFeatureIndex, toPassFeatureId } from './passFeatures';

describe('PASS_FEATURES', () => {
  it('기능마다 id가 다르다', () => {
    const ids = PASS_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('toPassFeatureId', () => {
  it('아는 id만 받는다 (딥링크 값은 믿지 않는다)', () => {
    expect(toPassFeatureId('foodCheck')).toBe('foodCheck');
    expect(toPassFeatureId('nope')).toBeNull();
    expect(toPassFeatureId(undefined)).toBeNull();
    expect(toPassFeatureId(['recommend'])).toBe('recommend');
  });
});

describe('passFeatureIndex', () => {
  it('그 기능의 순서, 모르면 첫 장', () => {
    expect(passFeatureIndex('foodCheck')).toBe(0);
    expect(passFeatureIndex('inbody')).toBe(PASS_FEATURES.length - 1);
    expect(passFeatureIndex(null)).toBe(0);
  });
});
