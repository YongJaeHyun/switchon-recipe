import { describe, expect, it } from 'vitest';
// @ts-expect-error 서버 공용 모듈은 .ts 확장자 import(Deno)라 앱 tsconfig에서 TS5097. 이 테스트만 예외.
import { mealKind, type Meal, type MealKind } from '../supabase/functions/_shared/recommend.ts';
import { BASE_TODOS } from './baseTodos';

// 서버(Edge Function)의 끼니 규칙 표가 앱 BASE_TODOS 문구와 어긋나지 않는지 확인한다.
const ITEM_INDEX: Record<Meal, number> = { breakfast: 0, lunch: 1, dinner: 3 };
const KIND_TEXT: Record<MealKind, string> = { shake: '쉐이크', low: '저탄수식', zero: '무탄수식' };

describe('mealKind와 BASE_TODOS 일치', () => {
  for (const step of [1, 2, 3, 4, 5]) {
    for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
      it(`step ${step} ${meal}`, () => {
        const text = BASE_TODOS[step][ITEM_INDEX[meal]];
        expect(text).toContain(KIND_TEXT[mealKind(step, meal)]);
      });
    }
  }
});
