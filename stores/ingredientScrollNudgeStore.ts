import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// 재료 줄이 옆으로 넘어간다는 걸 처음 한 번만 살짝 밀어 보여 준다 (재료로 만들기 화면 처음 열 때).
// 한 번 보여 줬으면 기기에 남겨 다시는 하지 않는다
interface IngredientScrollNudgeStore {
  nudged: boolean;
  // 기기에 남긴 값을 다 읽었는지 (읽기 전엔 아직 안 보여 준 것으로 착각하지 않게)
  hydrated: boolean;
  // 처음 넘치는 줄 하나만 true를 받는다
  claim(): boolean;
}

export const useIngredientScrollNudgeStore = create<IngredientScrollNudgeStore>()(
  persist(
    (set, get) => ({
      nudged: false,
      hydrated: false,
      claim: () => {
        const { nudged, hydrated } = get();
        if (!hydrated || nudged) return false;
        set({ nudged: true });
        return true;
      },
    }),
    {
      name: 'ingredientScrollNudgeStore',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ nudged: state.nudged }),
      onRehydrateStorage: () => () => useIngredientScrollNudgeStore.setState({ hydrated: true }),
    }
  )
);
