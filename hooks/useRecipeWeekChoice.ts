import { useEffect, useRef, useState } from 'react';
import { useUserStore } from 'stores/userStore';
import { Ingredient } from 'types/recipe';
import { getWeekAndDay } from 'utils/date';
import {
  defaultChosenWeek,
  pruneSelectionForWeek,
  weekPrunedMessage,
} from 'utils/recipeWeekChoice';
import { showInfoToast } from 'utils/showToast';

interface UseRecipeWeekChoiceProps {
  selectedIngredients: Ingredient[];
  upsertIngredients(ingredients: Ingredient[]): void;
  // 선택 재료와 재료 목록을 다 불러왔는지 (불러오기 전 빈 목록으로 정리하지 않게)
  isReady: boolean;
}

// 재료로 레시피 만들기(low/zero) 화면의 주차 선택. 처음은 지금 주차.
// 주차를 바꾸면 그 주차에 못 쓰는 선택 재료를 서버 저장 목록에서도 빼고 알려 준다.
// 화면에 들어왔을 때도 한 번 정리한다 (앞서 높은 주차로 골라 둔 재료가 저장돼 남아 있을 수 있음)
export const useRecipeWeekChoice = ({
  selectedIngredients,
  upsertIngredients,
  isReady,
}: UseRecipeWeekChoiceProps) => {
  const startDate = useUserStore((state) => state.start_date);
  const currentWeek = defaultChosenWeek(getWeekAndDay(startDate).week);
  const [week, setWeek] = useState(currentWeek);

  const prune = (nextWeek: number) => {
    const { kept, removed } = pruneSelectionForWeek(selectedIngredients, nextWeek);
    if (removed.length === 0) return;
    upsertIngredients(kept);
    showInfoToast({ textType: 'CUSTOM', title: weekPrunedMessage(nextWeek) });
  };

  const prunedOnLoad = useRef(false);
  const pruneRef = useRef(prune);
  pruneRef.current = prune;
  useEffect(() => {
    if (!isReady || prunedOnLoad.current) return;
    prunedOnLoad.current = true;
    pruneRef.current(week);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 불러온 뒤 한 번만
  }, [isReady]);

  const changeWeek = (nextWeek: number) => {
    if (nextWeek === week) return;
    setWeek(nextWeek);
    prune(nextWeek);
  };

  return { week, currentWeek, changeWeek };
};
