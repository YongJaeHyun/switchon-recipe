import { Text } from 'components/common/Text';
import { Pressable, View } from 'react-native';
import {
  pauseCookingTimer,
  removeCookingTimer,
  restartCookingTimer,
  resumeCookingTimer,
  startTimer,
  timerKey,
  useCookingStore,
} from 'stores/cookingStore';
import { formatClock, type StepTimer } from 'utils/cookingSteps';
import { remainingMs, timerState } from 'utils/cookingTimer';

interface Props {
  recipeId: number;
  recipeName: string;
  stepIndex: number;
  timer: StepTimer;
  now: number;
}

const PillButton = ({
  label,
  onPress,
  primary,
  a11y,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  a11y: string;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={a11y}
    hitSlop={6}
    className={`min-h-11 items-center justify-center rounded-full px-4 ${
      primary ? 'bg-amber-500' : 'border border-slate-600'
    }`}>
    <Text className={`font-bold ${primary ? 'text-neutral-900' : 'text-slate-200'}`}>{label}</Text>
  </Pressable>
);

// 요리 모드의 타이머 카드 (어두운 바탕). 상세 화면 칩과 같은 타이머
export function TimerCard({ recipeId, recipeName, stepIndex, timer, now }: Props) {
  const key = timerKey(recipeId, stepIndex);
  const running = useCookingStore((s) => s.timers[key]);
  const state = running ? timerState(running, now) : null;
  const clock = formatClock(running ? remainingMs(running, now) / 1000 : timer.seconds);

  return (
    <View
      className={`mt-5 flex-row items-center justify-between rounded-2xl border px-4 py-3 ${
        state === 'done' ? 'border-green-400 bg-green-950' : 'border-amber-500 bg-slate-800'
      }`}
      accessibilityLiveRegion={state === 'done' ? 'assertive' : 'none'}>
      <View>
        {state === 'done' ? (
          <Text className="text-2xl font-bold text-green-300">다 됐어요!</Text>
        ) : (
          <Text
            className="text-3xl font-bold text-amber-300"
            style={{ fontVariant: ['tabular-nums'] }}
            accessibilityLabel={`타이머 ${clock}`}>
            {clock}
          </Text>
        )}
        <Text className="text-xs text-slate-400">
          {state === 'paused' ? '일시정지' : `${timer.label} 타이머`}
        </Text>
      </View>
      <View className="flex-row gap-2">
        {!running && (
          <PillButton
            primary
            label="시작"
            a11y={`${timer.label} 타이머 시작`}
            onPress={() => startTimer({ recipeId, stepIndex, ...timer }, recipeName)}
          />
        )}
        {state === 'running' && (
          <PillButton
            primary
            label="일시정지"
            a11y="타이머 일시정지"
            onPress={() => pauseCookingTimer(key)}
          />
        )}
        {state === 'paused' && (
          <>
            <PillButton
              label="다시"
              a11y="타이머 처음부터 다시"
              onPress={() => restartCookingTimer(key, recipeName)}
            />
            <PillButton
              primary
              label="계속"
              a11y="타이머 계속"
              onPress={() => resumeCookingTimer(key, recipeName)}
            />
          </>
        )}
        {state === 'done' && (
          <>
            <PillButton label="끄기" a11y="타이머 끄기" onPress={() => removeCookingTimer(key)} />
            <PillButton
              primary
              label="다시"
              a11y="타이머 처음부터 다시"
              onPress={() => restartCookingTimer(key, recipeName)}
            />
          </>
        )}
      </View>
    </View>
  );
}
