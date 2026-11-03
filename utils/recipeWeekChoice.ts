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

// 재료로 만든 레시피의 주차 = 고른 재료 중 가장 높은 주차 (운영자 결정 2026-11-03).
// 명령문에 주차별 규칙이 없어 같은 재료면 3주차에 만들어도 2주차 레시피와 같으므로, 2주차 사용자도 보게 한다.
// 고른 주차는 넘지 않고, 재료 없이 아무거나 만들면 고른 주차. 결과는 recipeRuleWeek/recipeSaveWeek에 넣는다
export const ingredientRecipeWeek = (selected: { week: number }[], chosenWeek: number) => {
  if (selected.length === 0) return chosenWeek;
  const highest = selected.reduce(
    (max, i) => (Number.isFinite(i.week) && i.week > max ? i.week : max),
    1
  );
  return Math.min(highest, chosenWeek);
};

// 주차를 바꿨을 때 그 주차에 못 쓰는 선택 재료를 뺀다
export const pruneSelectionForWeek = <T extends { week: number }>(selected: T[], week: number) => {
  const kept = ingredientsForWeek(selected, week);
  return { kept, removed: selected.filter((i) => !kept.includes(i)) };
};

export const weekPrunedMessage = (week: number) =>
  `${weekChoiceLabel(week)}에 못 쓰는 재료는 뺐어요`;

// 재료 화면(low/zero)에서 고른 주차 기억 (앱을 켜 둔 동안). 그때의 지금 주차도 같이 둬서 주가 바뀌면 버린다
export interface RememberedWeekChoice {
  week: number;
  currentWeek: number;
}

// 재료 화면에 다시 들어왔을 때 고른 주차: 기억한 주차(없거나 지금 주차가 바뀌었으면 지금 주차).
// 저장돼 있는 선택 재료 중 더 높은 주차 재료가 있으면 그 주차까지 올려 아무것도 빼지 않는다
// (재료는 사용자가 주차를 직접 바꿀 때만 뺀다)
export const restoreChosenWeek = ({
  remembered,
  currentWeek,
  selected,
}: {
  remembered: RememberedWeekChoice | undefined;
  currentWeek: number;
  selected: { week: number }[];
}) => {
  const base = remembered && remembered.currentWeek === currentWeek ? remembered.week : currentWeek;
  const needed = selected.reduce(
    (max, i) => (Number.isFinite(i.week) && i.week > max ? i.week : max),
    0
  );
  return defaultChosenWeek(Math.max(base, needed));
};

// 먹고 싶은 음식으로 만들기의 주차 칸: 레시피 주차와 같은 1주차 / 2주차 / 3주차+ (탐색 탭과 같은 묶음)
export const NAME_WEEK_CHOICES = [1, 2, 3] as const;

export const nameWeekLabel = (choice: number) => (choice >= 3 ? '3주차+' : `${choice}주차`);

export const defaultNameWeekChoice = (currentWeek: number) =>
  Math.min(defaultChosenWeek(currentWeek), 3);

// 서버에 보낼 주차: 3주차+를 골랐고 지금이 3주차 이후면 지금 주차 규칙(4주차·유지기에 열린 음식 포함), 아니면 고른 칸
export const nameRequestWeek = (choice: number, currentWeek: number) =>
  choice >= 3 ? Math.max(3, defaultChosenWeek(currentWeek)) : choice;
