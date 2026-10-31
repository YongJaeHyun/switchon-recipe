import { describe, expect, it } from 'vitest';
import { baseServingsOf, scaleAmount, servingsStepperMax } from './scaleAmount';

// 사례는 실제 DB recipe.ingredients의 amount 값(빈도 상위 200개 + 특이 형식)에서 골랐다
describe('scaleAmount', () => {
  it('배율 1이면 입력을 그대로 돌려준다', () => {
    for (const a of ['1/2 작은술', '1과 1/2큰술', '약간', '0.50g', '1/2모 (약 150g)']) {
      expect(scaleAmount(a, 1)).toBe(a);
    }
  });

  it('숫자가 없는 양은 그대로 둔다', () => {
    for (const a of ['약간', '적당량', '기호에 따라', '넉넉히', '꼬집', '아주 소량']) {
      expect(scaleAmount(a, 2)).toBe(a);
    }
  });

  it('잘못된 배율이면 그대로 둔다', () => {
    expect(scaleAmount('100g', 0)).toBe('100g');
    expect(scaleAmount('100g', -1)).toBe('100g');
    expect(scaleAmount('100g', Number.NaN)).toBe('100g');
  });

  it.each([
    ['100g', '200g'],
    ['1큰술', '2큰술'],
    ['1/2작은술', '1작은술'],
    ['1/2 작은술', '1 작은술'],
    ['1 큰술', '2 큰술'],
    ['1.5큰술', '3큰술'],
    ['0.5작은술', '1작은술'],
    ['1/8작은술', '1/4작은술'],
    ['1/2모 (약 150g)', '1모 (약 300g)'],
    ['1/4개 (약 50g)', '1/2개 (약 100g)'],
    ['1큰술 (15ml)', '2큰술 (30ml)'],
    ['1캔 (150g, 기름 제거)', '2캔 (300g, 기름 제거)'],
    ['2쪽 (다진 마늘 1작은술)', '4쪽 (다진 마늘 2작은술)'],
    ['3-4개', '6-8개'],
    ['2~3장', '4~6장'],
    ['0.5~1작은술', '1~2작은술'],
    ['밥숟가락 2-3스푼 (약 50g)', '밥숟가락 4-6스푼 (약 100g)'],
    ['각 1/2개', '각 1개'],
    ['1꼬집', '2꼬집'],
    ['한 꼬집', '2 꼬집'],
    ['두 꼬집', '4 꼬집'],
    ['두부 1모 (약 300g)', '두부 2모 (약 600g)'],
    ['100g (밥 반 공기)', '200g (밥 1 공기)'],
    ['15g (반죽용 5g, 굽는 용 10g)', '30g (반죽용 10g, 굽는 용 20g)'],
    ['총 1과 1/2큰술', '총 3큰술'],
    ['1/2작은술 + 약간', '1작은술 + 약간'],
    ['1큰술 + 1/2큰술', '2큰술 + 1큰술'],
    ['5x5cm 1조각', '5x5cm 2조각'],
    ['10x15cm 4장', '10x15cm 8장'],
    ['5cm x 5cm 1조각', '5cm x 5cm 2조각'],
    ['50g (조리된 상태)', '100g (조리된 상태)'],
    ['1회 제공량', '2회 제공량'],
  ])('2배: %s → %s', (input, expected) => {
    expect(scaleAmount(input, 2)).toBe(expected);
  });

  it.each([
    ['200g', '100g'],
    ['1큰술', '1/2큰술'],
    ['1/2작은술', '1/4작은술'],
    ['1/4개 (약 50g)', '1/8개 (약 25g)'],
    ['5ml', '2.5ml'],
    ['3큰술 (45g)', '1.5큰술 (23g)'],
    ['5장', '2.5장'],
    ['1모 (약 300g)', '1/2모 (약 150g)'],
    ['1-2개', '1/2-1개'],
    ['0.5g', '0.3g'],
    // 1/8보다 작아지면 1/8로 둔다 (0으로 만들지 않는다)
    ['1/8작은술', '1/8작은술'],
  ])('1/2배: %s → %s', (input, expected) => {
    expect(scaleAmount(input, 0.5)).toBe(expected);
  });

  it.each([
    ['1/3개 (약 50g)', '1개 (약 150g)'],
    ['1/2작은술', '1.5작은술'],
    ['1/4개', '3/4개'],
    ['2개', '6개'],
  ])('3배: %s → %s', (input, expected) => {
    expect(scaleAmount(input, 3)).toBe(expected);
  });

  it.each([
    ['1큰술', '1/3큰술'],
    ['100g', '33g'],
    ['2개', '2/3개'],
    ['5-6장', '1.5-2장'],
    // 양 끝이 같아지면 하나로 줄인다
    ['3-4쪽', '1-1.5쪽'],
    ['1-1.2개', '1/3개'],
  ])('1/3배: %s → %s', (input, expected) => {
    expect(scaleAmount(input, 1 / 3)).toBe(expected);
  });

  it.each([
    ['1큰술', '1.5큰술'],
    ['1/2모', '3/4모'],
    ['150g', '225g'],
    ['1개', '1.5개'],
    ['1kg', '1.5kg'],
  ])('1.5배(2→3인분): %s → %s', (input, expected) => {
    expect(scaleAmount(input, 1.5)).toBe(expected);
  });

  it('1 이상인 숟가락·개수는 0.5 단위로 반올림한다 (3→4인분)', () => {
    expect(scaleAmount('1큰술', 4 / 3)).toBe('1.5큰술');
    expect(scaleAmount('3개', 4 / 3)).toBe('4개');
  });
});

describe('baseServingsOf', () => {
  it('1~10 정수만 기준 인분으로 받는다', () => {
    expect(baseServingsOf({ servings: 2 })).toBe(2);
    expect(baseServingsOf({ servings: 1 })).toBe(1);
    expect(baseServingsOf({ servings: 10 })).toBe(10);
  });

  it('없거나 잘못된 값이면 null (인분 조절을 숨긴다)', () => {
    for (const servings of [null, undefined, 0, 11, 1.5, '2', -1]) {
      expect(baseServingsOf({ servings })).toBeNull();
    }
    expect(baseServingsOf({})).toBeNull();
    expect(baseServingsOf(null)).toBeNull();
  });
});

describe('servingsStepperMax', () => {
  it('기본 6인분까지, 기준 인분이 더 크면 기준 인분까지', () => {
    expect(servingsStepperMax(1)).toBe(6);
    expect(servingsStepperMax(6)).toBe(6);
    expect(servingsStepperMax(8)).toBe(8);
  });
});
