import AsyncStorage from '@react-native-async-storage/async-storage';
import { IngredientRecord } from 'types/recipe';

const INGREDIENT_CACHE_KEY = 'ingredient_cache';

export const saveIngredientCache = async (list: IngredientRecord[]) => {
  await AsyncStorage.setItem(INGREDIENT_CACHE_KEY, JSON.stringify(list));
};

export const loadIngredientCache = async (): Promise<IngredientRecord[] | null> => {
  try {
    const value = await AsyncStorage.getItem(INGREDIENT_CACHE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

// 최신 목록을 받아 캐시에 저장하고, 실패하거나 빈 목록이면 캐시를 사용
export const loadIngredientsWithCache = async (
  fetcher: () => Promise<IngredientRecord[]>
): Promise<IngredientRecord[]> => {
  try {
    const list = await fetcher();
    if (list.length > 0) {
      await saveIngredientCache(list);
      return list;
    }

    return (await loadIngredientCache()) ?? list;
  } catch (error) {
    const cached = await loadIngredientCache();
    if (cached?.length) return cached;
    throw error;
  }
};
