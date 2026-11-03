// 조리 순서 타이머의 시간 계산 (순수). 상태·알림은 stores/cookingStore.ts
// 돌아가는 동안은 끝나는 시각(endsAt)만 들고 있어, 화면이 늦게 그려지거나 앱이 백그라운드에 있어도 시간이 맞다

export type CookingTimer = {
  key: string;
  recipeId: number;
  stepIndex: number;
  label: string;
  seconds: number;
  // 돌아가는 중이면 끝나는 시각(ms), 일시정지면 null
  endsAt: number | null;
  // 일시정지일 때 남은 시간(ms)
  pausedLeft: number;
};

export type TimerState = 'running' | 'paused' | 'done';

export const timerKey = (recipeId: number, stepIndex: number) => `${recipeId}:${stepIndex}`;

export function newTimer(
  {
    recipeId,
    stepIndex,
    label,
    seconds,
  }: Pick<CookingTimer, 'recipeId' | 'stepIndex' | 'label' | 'seconds'>,
  now: number
): CookingTimer {
  return {
    key: timerKey(recipeId, stepIndex),
    recipeId,
    stepIndex,
    label,
    seconds,
    endsAt: now + seconds * 1000,
    pausedLeft: 0,
  };
}

export const remainingMs = (timer: CookingTimer, now: number) =>
  timer.endsAt === null ? timer.pausedLeft : Math.max(0, timer.endsAt - now);

export function timerState(timer: CookingTimer, now: number): TimerState {
  if (timer.endsAt === null) return 'paused';
  return timer.endsAt <= now ? 'done' : 'running';
}

export function pauseTimer(timer: CookingTimer, now: number): CookingTimer {
  if (timerState(timer, now) !== 'running') return timer;
  return { ...timer, endsAt: null, pausedLeft: remainingMs(timer, now) };
}

export function resumeTimer(timer: CookingTimer, now: number): CookingTimer {
  if (timerState(timer, now) !== 'paused') return timer;
  return { ...timer, endsAt: now + timer.pausedLeft, pausedLeft: 0 };
}

export const resetTimer = (timer: CookingTimer, now: number): CookingTimer => newTimer(timer, now);
