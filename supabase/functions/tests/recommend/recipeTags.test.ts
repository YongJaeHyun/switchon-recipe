import { describe, expect, it } from 'vitest';
import { RECIPE_TAG_SCHEMA_PROMPT, parseRecipeTags } from '../../_shared/recipeTags.ts';

describe('parseRecipeTags', () => {
  it('정상 태그를 그대로 돌려준다', () => {
    expect(parseRecipeTags({ spicy: true, cuisine: 'korean', method: 'soup' })).toEqual({
      spicy: true,
      cuisine: 'korean',
      method: 'soup',
    });
  });

  it('목록 밖 cuisine이면 null', () => {
    expect(parseRecipeTags({ spicy: false, cuisine: 'thai', method: 'soup' })).toBeNull();
  });

  it('목록 밖 method이면 null', () => {
    expect(parseRecipeTags({ spicy: false, cuisine: 'korean', method: 'fry' })).toBeNull();
  });

  it('spicy가 문자열 "true"이면 null', () => {
    expect(parseRecipeTags({ spicy: 'true', cuisine: 'korean', method: 'soup' })).toBeNull();
  });

  it('필드 누락, null, 비객체는 null', () => {
    expect(parseRecipeTags({ spicy: true, cuisine: 'korean' })).toBeNull();
    expect(parseRecipeTags(null)).toBeNull();
    expect(parseRecipeTags('x')).toBeNull();
    expect(parseRecipeTags(undefined)).toBeNull();
  });
});

describe('RECIPE_TAG_SCHEMA_PROMPT', () => {
  it('세 태그와 값 목록을 설명한다', () => {
    expect(RECIPE_TAG_SCHEMA_PROMPT).toContain('spicy');
    expect(RECIPE_TAG_SCHEMA_PROMPT).toContain('rice_bowl');
    expect(RECIPE_TAG_SCHEMA_PROMPT).toContain('japanese');
  });
});
