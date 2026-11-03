import { Text } from 'components/common/Text';
import { useCookingClock } from 'hooks/useCookingClock';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { clearRecipeTimers } from 'stores/cookingStore';
import { parseCookingStep } from 'utils/cookingSteps';
import { StepPieces } from './StepPieces';
import { StepTimerChip } from './StepTimerChip';

interface Props {
  recipeId: number;
  recipeName: string;
  steps: string[];
}

// 레시피 상세의 조리 순서: 문장별 줄, 양·불 세기·시간 강조, 괄호 속 팁 상자, 타이머 칩. 읽기 전용
// (따라 하기는 요리 모드가 맡는다. 끝낸 단계 표시는 2026-11-04 운영자 결정으로 뺐다)
export function CookingStepList({ recipeId, recipeName, steps }: Props) {
  const parsed = useMemo(() => steps.map(parseCookingStep), [steps]);
  const now = useCookingClock();

  // 상세 화면을 떠나면(요리 모드는 이 화면 위에 열리므로 그때는 그대로) 이 레시피의 타이머와 알림을 지운다
  useEffect(() => () => clearRecipeTimers(recipeId), [recipeId]);

  return (
    <View>
      {parsed.map((step, index) => {
        const tone = 'light';
        const textClass = 'text-medium leading-7 tracking-wide text-neutral-900';
        return (
          <View
            key={index}
            accessibilityLabel={`${index + 1}단계`}
            className={`w-full flex-row border-t border-neutral-100 py-4 ${index === 0 ? 'border-t-0' : ''}`}>
            <View className="mr-4 mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-green-600">
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
                <View key={`tip${i}`} className="mt-2 flex-row rounded-lg bg-neutral-50 px-3 py-2">
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
          </View>
        );
      })}
    </View>
  );
}
