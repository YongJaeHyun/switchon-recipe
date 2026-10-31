import { useFocusEffect } from 'expo-router';
import { useCallback, useId } from 'react';
import { useRecipeJobStore } from 'stores/recipeJobStore';

// 레시피 만들기를 시작하는 화면의 표시. 이 화면을 보고 있는 동안 완성되면 띠 대신 바로 레시피로 간다
export const useRecipeJobOrigin = () => {
  const origin = useId();
  useFocusEffect(
    useCallback(() => {
      const { focusOrigin, blurOrigin } = useRecipeJobStore.getState();
      focusOrigin(origin);
      return () => blurOrigin(origin);
    }, [origin])
  );
  return origin;
};
