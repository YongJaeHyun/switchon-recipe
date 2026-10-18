import { Ingredient } from 'types/recipe';

// 저장된 선택 재료를 현재 재료 목록 기준으로 복원 (이미지 등 최신화, 없어진 재료 제외)
export const rehydrateSelectedIngredients = (
  saved: Pick<Ingredient, 'name'>[],
  all: Ingredient[]
): Ingredient[] =>
  saved.flatMap(({ name }) => {
    const current = all.find((i) => i.name === name);
    return current ? [current] : [];
  });
