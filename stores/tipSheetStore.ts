import { create } from 'zustand';
import type { Tip } from 'utils/dietGuide';

interface TipSheetState {
  tip: Tip | null;
  // 같은 팁을 다시 열 때도 시트가 열리도록 매번 바뀌는 값
  openedAt: number;
  open: (tip: Tip) => void;
}

export const useTipSheetStore = create<TipSheetState>()((set) => ({
  tip: null,
  openedAt: 0,
  open: (tip) => set({ tip, openedAt: Date.now() }),
}));
