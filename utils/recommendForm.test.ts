import { BASE_TODOS } from 'const/baseTodos';
import { describe, expect, it } from 'vitest';
// @ts-expect-error 서버 공용 모듈은 .ts 확장자 import(Deno)라 앱 tsconfig에서 TS5097. 일치 검사용으로만 import
import * as shared from '../supabase/functions/_shared/recommend.ts';
// @ts-expect-error 위와 같은 이유
import * as sharedTags from '../supabase/functions/_shared/recipeTags.ts';
import type { Meal, MealKind } from 'types/recommend';
import {
  availableMeals,
  buildRecipeCommand,
  CUISINE_OPTIONS,
  isRecommendLocked,
  isZeroCarbMeal,
  mergeSavedExclude,
  removeCarbMustInclude,
  toRecommendRequest,
  mealKind,
  METHOD_OPTIONS,
  parseMealParam,
  recipeWeekOf,
  stepOf,
} from './recommendForm';

describe('availableMeals', () => {
  it('1주차 2일: 모두 쉐이크라 비활성', () => {
    const meals = availableMeals(1, 2);
    expect(meals.map((m) => m.meal)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(meals.every((m) => !m.enabled && m.reason === '이 끼니는 프로틴쉐이크예요')).toBe(true);
  });

  it('1주차 4일(단계 2): 점심만 활성', () => {
    expect(availableMeals(1, 4)).toEqual([
      { meal: 'breakfast', enabled: false, reason: '이 끼니는 프로틴쉐이크예요' },
      { meal: 'lunch', enabled: true },
      { meal: 'dinner', enabled: false, reason: '이 끼니는 프로틴쉐이크예요' },
    ]);
  });

  // 계획서 예시는 "점심만 활성"이지만 BASE_TODOS[3](2주차)의 저녁은 무탄수식이다. BASE_TODOS를 따른다
  it('2주차 1일(단계 3): 점심·저녁 활성', () => {
    expect(availableMeals(2, 1)).toEqual([
      { meal: 'breakfast', enabled: false, reason: '이 끼니는 프로틴쉐이크예요' },
      { meal: 'lunch', enabled: true },
      { meal: 'dinner', enabled: true },
    ]);
  });
});

describe('isRecommendLocked', () => {
  it('1주차 1~3일은 잠김, 4일부터 열림', () => {
    expect(isRecommendLocked(1, 1)).toBe(true);
    expect(isRecommendLocked(1, 3)).toBe(true);
    expect(isRecommendLocked(1, 4)).toBe(false);
    expect(isRecommendLocked(2, 1)).toBe(false);
    expect(isRecommendLocked(9, 7)).toBe(false);
  });
});

describe('buildRecipeCommand', () => {
  it('3주차 저녁(무탄수) + 매운 + 15분', () => {
    const { command, isZeroCarb } = buildRecipeCommand(
      { spicy: true, maxMinutes: 15, meal: 'dinner' },
      { week: 3, day: 1 }
    );
    expect(isZeroCarb).toBe(true);
    expect(command.split('\n')).toContain('Taste: spicy');
    expect(command).toContain('15 minutes');
    expect(command).toContain('zero-carb');
    expect(command).toContain('Switch-On week 3');
  });

  it('점심은 저탄수', () => {
    const { command, isZeroCarb } = buildRecipeCommand({ meal: 'lunch' }, { week: 3, day: 1 });
    expect(isZeroCarb).toBe(false);
    expect(command).toContain('low-carb');
  });

  it('기존 생성 화면 형식: 영어 지시문 + 카테고리·방식 줄 + 고정 꼬리 줄', () => {
    const { command } = buildRecipeCommand(
      { cuisine: 'korean', method: 'stir_fry', meal: 'lunch' },
      { week: 2, day: 3 }
    );
    expect(command.split('\n')).toEqual([
      'find a delicious low-carb recipe randomly that can be eaten during Switch-On week 2.',
      'Cooking category: 한식',
      'Cooking method: 볶음류',
      'Remove Switch-On week or carbohydrate from the recipe name.',
      'You may freely use sauces or seasonings.',
    ]);
  });

  it('안 매운 것·30분·꼭 넣을/뺄 재료 줄', () => {
    const { command } = buildRecipeCommand(
      {
        spicy: false,
        maxMinutes: 30,
        meal: 'lunch',
        mustInclude: ['두부', '계란'],
        exclude: ['오이', '버섯'],
      },
      { week: 2, day: 1 }
    );
    expect(command).toContain('Taste: not spicy');
    expect(command).toContain('Cooking time: within 30 minutes');
    expect(command).toContain('Must include these ingredients: 두부, 계란');
    expect(command).toContain('Do not use these ingredients: 오이, 버섯');
  });

  it('상관없음(null)·빈 목록은 줄을 만들지 않는다', () => {
    const { command } = buildRecipeCommand(
      { spicy: null, cuisine: null, method: null, maxMinutes: null, mustInclude: [], exclude: [] },
      { week: 2, day: 1 }
    );
    expect(command).not.toMatch(/Taste|Cooking time|Must include|Do not use|category|method/);
  });

  it('주차는 4로 묶는다', () => {
    const { command } = buildRecipeCommand({ meal: 'lunch' }, { week: 7, day: 1 });
    expect(command).toContain('Switch-On week 4.');
  });

  it('끼니 미선택: 현재 단계 저녁이 무탄수면 무탄수', () => {
    expect(buildRecipeCommand({}, { week: 2, day: 1 }).isZeroCarb).toBe(true); // 단계 3
    expect(buildRecipeCommand({}, { week: 3, day: 5 }).isZeroCarb).toBe(true); // 단계 4
  });

  it('끼니 미선택: 저녁이 무탄수가 아니면 저탄수', () => {
    expect(buildRecipeCommand({}, { week: 1, day: 5 }).isZeroCarb).toBe(false); // 단계 2
    expect(buildRecipeCommand({}, { week: 4, day: 1 }).isZeroCarb).toBe(false); // 단계 5
  });

  it('쉐이크 끼니가 들어오면 끼니 미선택과 같게 처리', () => {
    expect(buildRecipeCommand({ meal: 'breakfast' }, { week: 2, day: 1 }).isZeroCarb).toBe(true);
  });
});

describe('isZeroCarbMeal', () => {
  it('buildRecipeCommand와 같은 규칙', () => {
    expect(isZeroCarbMeal('dinner', 2, 1)).toBe(true);
    expect(isZeroCarbMeal('lunch', 2, 1)).toBe(false);
    expect(isZeroCarbMeal(null, 2, 1)).toBe(true);
    expect(isZeroCarbMeal(null, 5, 1)).toBe(false);
  });
});

describe('mergeSavedExclude', () => {
  it('손대지 않았으면 저장된 목록 그대로', () => {
    expect(mergeSavedExclude(['오이'], ['버섯', '양파'], false)).toEqual(['버섯', '양파']);
  });

  it('이미 고쳤으면 합집합 (화면 목록 순서 먼저, 중복 없음)', () => {
    expect(mergeSavedExclude(['오이', '버섯'], ['버섯', '양파'], true)).toEqual([
      '오이',
      '버섯',
      '양파',
    ]);
  });
});

describe('removeCarbMustInclude', () => {
  const ingredients = [
    { name: '현미밥', isCarbohydrate: true },
    { name: '고구마', isCarbohydrate: true },
    { name: '두부' },
  ];

  it('무탄수면 탄수화물 재료를 뺀다', () => {
    expect(removeCarbMustInclude(['현미밥', '두부'], ingredients, true)).toEqual({
      kept: ['두부'],
      removed: ['현미밥'],
    });
  });

  it('저탄수면 그대로', () => {
    expect(removeCarbMustInclude(['현미밥', '두부'], ingredients, false)).toEqual({
      kept: ['현미밥', '두부'],
      removed: [],
    });
  });

  it('목록에 없는 재료는 남긴다', () => {
    expect(removeCarbMustInclude(['낯선재료'], ingredients, true).kept).toEqual(['낯선재료']);
  });
});

describe('toRecommendRequest', () => {
  const c = { spicy: true, meal: 'lunch' as const, mustInclude: ['두부'], exclude: [] };

  it('저장 목록을 받았으면 화면 목록을 그대로 보낸다 (빈 배열 포함)', () => {
    expect(toRecommendRequest(c, { savedLoaded: true })).toEqual(c);
  });

  it('저장 목록을 아직 못 받았으면 exclude를 뺀다 (서버가 저장된 목록을 쓴다)', () => {
    const body = toRecommendRequest({ ...c, exclude: ['오이'] }, { savedLoaded: false });
    expect('exclude' in body).toBe(false);
    expect(body).toEqual({ spicy: true, meal: 'lunch', mustInclude: ['두부'] });
  });
});

describe('parseMealParam', () => {
  it('끼니 값만 받는다', () => {
    expect(parseMealParam('dinner')).toBe('dinner');
    expect(parseMealParam(['lunch'])).toBe('lunch');
    expect(parseMealParam('snack')).toBeNull();
    expect(parseMealParam(undefined)).toBeNull();
  });
});

describe('recipeWeekOf', () => {
  it('생성 레시피 주차는 3으로 묶는다 (기존 생성 화면과 같음)', () => {
    expect(recipeWeekOf(1)).toBe(1);
    expect(recipeWeekOf(3)).toBe(3);
    expect(recipeWeekOf(6)).toBe(3);
  });
});

// 앱 복사본이 BASE_TODOS·서버 공용 모듈과 어긋나지 않는지 확인한다
describe('끼니 규칙 일치', () => {
  const ITEM_INDEX: Record<Meal, number> = { breakfast: 0, lunch: 1, dinner: 3 };
  const KIND_TEXT: Record<MealKind, string> = {
    shake: '쉐이크',
    low: '저탄수식',
    zero: '무탄수식',
  };
  const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];

  for (const step of [1, 2, 3, 4, 5]) {
    for (const meal of MEALS) {
      it(`단계 ${step} ${meal}: BASE_TODOS·서버와 같음`, () => {
        expect(BASE_TODOS[step][ITEM_INDEX[meal]]).toContain(KIND_TEXT[mealKind(step, meal)]);
        expect(mealKind(step, meal)).toBe(shared.mealKind(step, meal));
      });
    }
  }

  it('stepOf가 서버와 같음', () => {
    for (let week = 1; week <= 8; week++) {
      for (let day = 1; day <= 7; day++) {
        expect(stepOf(week, day)).toBe(shared.stepOf(week, day));
      }
    }
  });

  it('종류·방식 선택지는 서버 값 목록 안에 있다', () => {
    for (const { value } of CUISINE_OPTIONS) expect(sharedTags.CUISINES).toContain(value);
    for (const { value } of METHOD_OPTIONS) expect(sharedTags.METHODS).toContain(value);
  });
});
