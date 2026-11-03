import { Text } from 'components/common/Text';
import { Pressable } from 'react-native';
import {
  pauseCookingTimer,
  restartCookingTimer,
  resumeCookingTimer,
  startTimer,
  timerKey,
  useCookingStore,
} from 'stores/cookingStore';
import type { StepTimer } from 'utils/cookingSteps';
import { formatClock } from 'utils/cookingSteps';
import { remainingMs, timerState } from 'utils/cookingTimer';

interface Props {
  recipeId: number;
  recipeName: string;
  stepIndex: number;
  timer: StepTimer;
  now: number;
}

// 상세 화면 조리 순서의 [⏱ 5분 타이머] 칩. 요리 모드의 타이머 카드와 같은 타이머를 쓴다
// 누를 때마다: 시작 → 일시정지 → 계속, 끝나면 다시
export function StepTimerChip({ recipeId, recipeName, stepIndex, timer, now }: Props) {
  const key = timerKey(recipeId, stepIndex);
  const running = useCookingStore((s) => s.timers[key]);
  const state = running ? timerState(running, now) : null;
  const clock = running ? formatClock(remainingMs(running, now) / 1000) : '';

  const onPress = () => {
    if (!running) startTimer({ recipeId, stepIndex, ...timer }, recipeName);
    else if (state === 'running') pauseCookingTimer(key);
    else if (state === 'paused') resumeCookingTimer(key, recipeName);
    else restartCookingTimer(key, recipeName);
  };

  const label =
    state === 'running'
      ? `⏸ ${clock}`
      : state === 'paused'
        ? `▶ ${clock} 계속`
        : state === 'done'
          ? '✓ 다 됐어요 · 다시'
          : `⏱ ${timer.label} 타이머`;
  const a11y =
    state === 'running'
      ? `${timer.label} 타이머 ${clock} 남음, 눌러서 일시정지`
      : state === 'paused'
        ? `${timer.label} 타이머 일시정지, 눌러서 계속`
        : state === 'done'
          ? `${timer.label} 타이머 끝남, 눌러서 다시 시작`
          : `${timer.label} 타이머 시작`;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      className={`mt-2 self-start rounded-full border px-3 py-1 ${
        state === 'done'
          ? 'border-green-600 bg-green-50'
          : state === 'running'
            ? 'border-amber-500 bg-amber-50'
            : 'border-amber-500 bg-white'
      }`}>
      <Text
        className={`text-sm font-bold ${state === 'done' ? 'text-green-700' : 'text-amber-700'}`}
        style={{ fontVariant: ['tabular-nums'] }}>
        {label}
      </Text>
    </Pressable>
  );
}
