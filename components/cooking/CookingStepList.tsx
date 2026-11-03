import { Text } from 'components/common/Text';
import { useCookingClock } from 'hooks/useCookingClock';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { clearRecipeTimers } from 'stores/cookingStore';
import { parseCookingStep } from 'utils/cookingSteps';
import { StepPieces } from './StepPieces';
import { StepTimerChip } from './StepTimerChip';

interface Props {
  recipeId: number;
  recipeName: string;
  steps: string[];
}

// 레시피 상세의 조리 순서: 문장별 줄, 양·불 세기·시간 강조, 괄호 속 팁 상자, 타이머 칩.
// 단계를 누르면 끝낸 단계로 흐리게 (이 화면을 보는 동안만 기억, 서버에 보내지 않음)
export function CookingStepList({ recipeId, recipeName, steps }: Props) {
  const parsed = useMemo(() => steps.map(parseCookingStep), [steps]);
  const [done, setDone] = useState<{ id: number; steps: Set<number> }>({
    id: recipeId,
    steps: new Set(),
  });
  // 비슷한 레시피로 이동해 같은 화면이 다른 레시피로 바뀌면 처음부터
  const doneSteps = done.id === recipeId ? done.steps : new Set<number>();
  const now = useCookingClock();

  // 상세 화면을 떠나면(요리 모드는 이 화면 위에 열리므로 그때는 그대로) 이 레시피의 타이머와 알림을 지운다
  useEffect(() => () => clearRecipeTimers(recipeId), [recipeId]);

  const toggle = (index: number) => {
    const next = new Set(doneSteps);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setDone({ id: recipeId, steps: next });
  };

  return (
    <View>
      {parsed.map((step, index) => {
        const isDone = doneSteps.has(index);
        const tone = isDone ? 'done' : 'light';
        const textClass = `text-medium leading-7 tracking-wide ${
          isDone ? 'text-neutral-400 line-through' : 'text-neutral-900'
        }`;
        return (
          <Pressable
            key={index}
            onPress={() => toggle(index)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isDone }}
            accessibilityLabel={`${index + 1}단계`}
            accessibilityHint={isDone ? '눌러서 안 한 단계로 되돌리기' : '눌러서 끝낸 단계로 표시'}
            className={`w-full flex-row border-t border-neutral-100 py-4 ${index === 0 ? 'border-t-0' : ''}`}>
            <View
              className={`mr-4 mt-0.5 h-7 w-7 items-center justify-center rounded-full ${
                isDone ? 'bg-neutral-300' : 'bg-green-600'
              }`}>
              <Text className="text-center font-bold text-white">{index + 1}</Text>
            </View>
            <View className="flex-1">
              {step.lines.length > 1 ? (
                <View className="gap-1.5">
                  {step.lines.map((line, i) => (
                    <View key={i} className="flex-row">
                      <Text className={`${textClass} w-4 no-underline`}>•</Text>
                      <StepPieces pieces={line} tone={tone} className={`flex-1 ${textClass}`} />
                    </View>
                  ))}
                </View>
              ) : (
                step.lines.map((line, i) => (
                  <StepPieces key={i} pieces={line} tone={tone} className={textClass} />
                ))
              )}
              {step.tips.map((tip, i) => (
                <View
                  key={`tip${i}`}
                  className={`mt-2 flex-row rounded-lg bg-neutral-50 px-3 py-2 ${isDone ? 'opacity-50' : ''}`}>
                  <Text className="mr-1.5 text-sm">💡</Text>
                  <StepPieces
                    pieces={tip}
                    tone="tip"
                    className="flex-1 text-sm leading-5 text-neutral-500"
                  />
                </View>
              ))}
              {step.timer && (
                <StepTimerChip
                  recipeId={recipeId}
                  recipeName={recipeName}
                  stepIndex={index}
                  timer={step.timer}
                  now={now}
                />
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
