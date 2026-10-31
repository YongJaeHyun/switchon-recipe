import { useEffect, useRef, useState } from 'react';
import { useUserStore } from 'stores/userStore';
import { Ingredient } from 'types/recipe';
import { getWeekAndDay } from 'utils/date';
import {
  defaultChosenWeek,
  pruneSelectionForWeek,
  type RememberedWeekChoice,
  restoreChosenWeek,
  weekPrunedMessage,
} from 'utils/recipeWeekChoice';
import { showInfoToast } from 'utils/showToast';

type CreationType = 'low' | 'zero';

// 화면별로 고른 주차 (앱을 켜 둔 동안). 나갔다 들어와도 같은 주차로 시작한다
const rememberedWeeks: Partial<Record<CreationType, RememberedWeekChoice>> = {};

interface UseRecipeWeekChoiceProps {
  type: CreationType;
  selectedIngredients: Ingredient[];
  upsertIngredients(ingredients: Ingredient[]): void;
  // 선택 재료와 재료 목록을 다 불러왔는지 (불러오기 전 빈 목록으로 주차를 정하지 않게)
  isReady: boolean;
}

// 재료로 레시피 만들기(low/zero) 화면의 주차 선택. 처음은 이 화면에서 고른 주차(없으면 지금 주차).
// 저장된 선택 재료에 더 높은 주차 재료가 있으면 그 주차로 맞춰 재료를 지키고,
// 사용자가 주차를 직접 바꿀 때만 그 주차에 못 쓰는 선택 재료를 서버 저장 목록에서도 빼고 알려 준다
export const useRecipeWeekChoice = ({
  type,
  selectedIngredients,
  upsertIngredients,
  isReady,
}: UseRecipeWeekChoiceProps) => {
  const startDate = useUserStore((state) => state.start_date);
  const currentWeek = defaultChosenWeek(getWeekAndDay(startDate).week);
  const [week, setWeek] = useState(() =>
    restoreChosenWeek({ remembered: rememberedWeeks[type], currentWeek, selected: [] })
  );

  useEffect(() => {
    rememberedWeeks[type] = { week, currentWeek };
  }, [type, week, currentWeek]);

  // 불러온 뒤 한 번: 선택 재료를 지킬 수 있게 주차를 맞춘다 (재료는 빼지 않는다)
  const restored = useRef(false);
  useEffect(() => {
    if (!isReady || restored.current) return;
    restored.current = true;
    setWeek((prev) =>
      restoreChosenWeek({
        remembered: { week: prev, currentWeek },
        currentWeek,
        selected: selectedIngredients,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 불러온 뒤 한 번만
  }, [isReady]);

  const changeWeek = (nextWeek: number) => {
    if (nextWeek === week) return;
    setWeek(nextWeek);
    const { kept, removed } = pruneSelectionForWeek(selectedIngredients, nextWeek);
    if (removed.length === 0) return;
    upsertIngredients(kept);
    showInfoToast({ textType: 'CUSTOM', title: weekPrunedMessage(nextWeek) });
  };

  return { week, currentWeek, changeWeek };
};
