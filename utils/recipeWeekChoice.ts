import { ingredientsForWeek } from './ingredientLists';

// 레시피를 만들 때 고르는 주차. 1~4주차와 유지기(5). 지금보다 앞·뒤 주차 음식도 미리 만들 수 있다
export const RECIPE_WEEK_CHOICES = [1, 2, 3, 4, 5] as const;
const MAINTENANCE_WEEK = 5;

export const weekChoiceLabel = (week: number) =>
  week >= MAINTENANCE_WEEK ? '유지기' : `${week}주차`;

// 처음 고른 주차 = 지금 주차 (시작 전은 getWeekAndDay가 1을 준다, 5주차 이상은 유지기)
export const defaultChosenWeek = (currentWeek: number) => {
  if (!Number.isFinite(currentWeek) || currentWeek < 1) return 1;
  return Math.min(Math.floor(currentWeek), MAINTENANCE_WEEK);
};

// 명령문에 쓰는 규칙 주차 (4주차까지)와 저장하는 레시피 주차 (3주차까지)
export const recipeRuleWeek = (week: number) => Math.min(week, 4);
export const recipeSaveWeek = (week: number) => Math.min(week, 3);

// 주차를 바꿨을 때 그 주차에 못 쓰는 선택 재료를 뺀다
export const pruneSelectionForWeek = <T extends { week: number }>(selected: T[], week: number) => {
  const kept = ingredientsForWeek(selected, week);
  return { kept, removed: selected.filter((i) => !kept.includes(i)) };
};

export const weekPrunedMessage = (week: number) =>
  `${weekChoiceLabel(week)}에 못 쓰는 재료는 뺐어요`;
