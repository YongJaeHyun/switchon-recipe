import { describe, expect, it } from 'vitest';
import { ingredientsByStep } from './stepIngredients';

const ing = (name: string, amount = '1개', isOptional = false) => ({ name, amount, isOptional });

describe('ingredientsByStep', () => {
  it('단계 문장에 나온 재료만, 문장에 나온 순서대로', () => {
    const result = ingredientsByStep(
      ['두부는 한입 크기로 썰고, 곤약면은 헹궈 물기를 빼요.', '냄비에 다진 마늘과 대파를 볶아요.'],
      [
        ing('곤약면', '150g'),
        ing('두부', '200g'),
        ing('다진 마늘', '1작은술'),
        ing('대파 (송송 썬 것)', '1/2대'),
      ]
    );
    expect(result[0].map((r) => r.name)).toEqual(['두부', '곤약면']);
    expect(result[1].map((r) => r.name)).toEqual(['다진 마늘', '대파 (송송 썬 것)']);
  });

  it('긴 재료 이름이 먼저 잡혀서 짧은 이름이 겹쳐 잡히지 않는다 (순두부 ≠ 두부)', () => {
    const result = ingredientsByStep(
      ['순두부를 떠 넣고 두부면을 넣어요.'],
      [ing('두부'), ing('순두부'), ing('두부면')]
    );
    expect(result[0].map((r) => r.name)).toEqual(['순두부', '두부면']);
  });

  it('괄호 설명과 "또는"·"/"로 나뉜 이름도 찾는다', () => {
    const result = ingredientsByStep(
      ['물(또는 육수) 200ml를 붓고 국간장을 넣어요.', '다시마 육수에 멸치를 넣어요.'],
      [ing('멸치/다시마 육수 (또는 물)', '400ml'), ing('국간장', '1큰술')]
    );
    expect(result[0].map((r) => r.name)).toEqual(['멸치/다시마 육수 (또는 물)', '국간장']);
    expect(result[1].map((r) => r.name)).toEqual(['멸치/다시마 육수 (또는 물)']);
  });

  it('한 글자 재료는 낱말일 때만 (물기·물엿에서 "물"을 잡지 않는다)', () => {
    const result = ingredientsByStep(
      ['곤약면의 물기를 빼요.', '물을 붓고 끓여요.'],
      [ing('물', '300ml'), ing('곤약면')]
    );
    expect(result[0].map((r) => r.name)).toEqual(['곤약면']);
    expect(result[1].map((r) => r.name)).toEqual(['물']);
  });

  it('단계 문장에 재료 바로 뒤 양이 있으면 그 양, 없으면 전체 양', () => {
    const result = ingredientsByStep(
      ['올리브유 1/2큰술을 두르고 물 200ml를 부어요.', '남은 올리브유를 둘러요.', '불을 꺼요.'],
      [ing('올리브유', '1큰술'), ing('물', '300ml')]
    );
    expect(result[0]).toEqual([
      { name: '올리브유', amount: '1/2큰술', isOptional: false, fromStep: true },
      { name: '물', amount: '200ml', isOptional: false, fromStep: true },
    ]);
    expect(result[1]).toEqual([
      { name: '올리브유', amount: '1큰술', isOptional: false, fromStep: false },
    ]);
    expect(result[2]).toEqual([]);
  });

  it('문자열로만 된 옛 재료 목록도 이름으로 찾는다', () => {
    const result = ingredientsByStep(['닭가슴살을 구워요.'], ['닭가슴살 100g', '소금 약간']);
    expect(result[0]).toEqual([
      { name: '닭가슴살 100g', amount: null, isOptional: false, fromStep: false },
    ]);
  });

  it('꾸미는 말이 붙은 재료는 마지막 낱말로도 찾는다', () => {
    const result = ingredientsByStep(
      ['딜과 파슬리를 다지고 마늘을 볶아요.'],
      [ing('신선한 딜'), ing('신선한 파슬리'), ing('다진 마늘')]
    );
    expect(result[0].map((r) => r.name)).toEqual(['신선한 파슬리', '다진 마늘']);
  });
});
