import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from 'components/common/Text';
import { StepIngredientList } from 'components/cooking/StepIngredientList';
import { StepPieces } from 'components/cooking/StepPieces';
import { TimerCard } from 'components/cooking/TimerCard';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCookingClock } from 'hooks/useCookingClock';
import { useKeepScreenOn } from 'hooks/useKeepScreenOn';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearRecipeTimers, setLastStep, useCookingStore } from 'stores/cookingStore';
import colors from 'tailwindcss/colors';
import type { RecipeDB } from 'types/database';
import { type CookingStep, formatClock, parseCookingStep } from 'utils/cookingSteps';
import { remainingMs, timerState } from 'utils/cookingTimer';
import { parseRecipeFields } from 'utils/recipeFields';
import { baseServingsOf } from 'utils/scaleAmount';
import { ingredientsByStep } from 'utils/stepIngredients';

// 요리 모드: 한 단계씩 크게, 어두운 바탕. 레시피는 상세 화면처럼 JSON 파라미터로, 인분은 상세에서 고른 값.
// 화면이 꺼지지 않고(네이티브 모듈이 있는 빌드에서만), 타이머는 단계를 넘겨도 계속 돈다.
// 닫으면 이 레시피의 타이머·알림을 지우고, 마지막으로 본 단계는 이번 실행 동안 기억한다
export default function CookingModeScreen() {
  const params = useLocalSearchParams<{ recipe: string; servings?: string }>();
  const recipe: RecipeDB = JSON.parse(params.recipe);
  const { id, recipe_name } = recipe;
  const recipeName = recipe_name ?? '';
  const fields = parseRecipeFields(recipe);
  const steps: CookingStep[] = useMemo(
    () => fields.cookingSteps.map((s) => parseCookingStep(String(s))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.recipe]
  );
  const baseServings = baseServingsOf(recipe);
  const servings = Number(params.servings) || baseServings || 1;
  // 단계마다 그 단계 문장에 나온 재료 (재료 보기 시트 대신)
  const stepIngredients = useMemo(
    () =>
      ingredientsByStep(
        fields.cookingSteps.map((s) => String(s)),
        fields.ingredients as Parameters<typeof ingredientsByStep>[1]
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.recipe]
  );
  const amountFactor = baseServings ? servings / baseServings : 1;

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<CookingStep>>(null);
  const [index, setIndex] = useState(() =>
    Math.min(useCookingStore.getState().lastStep[id] ?? 0, Math.max(0, steps.length - 1))
  );
  const now = useCookingClock();
  const keepsScreenOn = useKeepScreenOn(`cooking-${id}`);
  const timers = useCookingStore((s) => s.timers);

  useEffect(() => setLastStep(id, index), [id, index]);
  useEffect(() => () => clearRecipeTimers(id), [id]);

  const isLast = index === steps.length - 1;
  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(steps.length - 1, next));
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  };
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };
  const onSwipeEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  // 다른 단계에서 돌고 있는 타이머 (위쪽 작은 줄)
  const otherTimers = Object.values(timers)
    .filter((t) => t.recipeId === id && t.stepIndex !== index)
    .sort((a, b) => a.stepIndex - b.stepIndex);

  return (
    <View className="flex-1 bg-slate-900" style={{ paddingTop: insets.top }}>
      <StatusBar style="light" />
      <View className="flex-row items-center justify-between px-2 pt-2">
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="요리 모드 닫기"
          className="h-12 flex-row items-center gap-1 px-3">
          <Ionicons name="close" size={22} color={colors.slate[300]} />
          <Text className="text-slate-300">닫기</Text>
        </Pressable>
        <Text className="mx-2 flex-1 text-center font-semibold text-slate-300" numberOfLines={1}>
          {recipeName}
        </Text>
        <Text
          className="px-4 font-semibold text-slate-300"
          accessibilityLabel={`${steps.length}단계 중 ${index + 1}단계`}>
          {index + 1} / {steps.length}
        </Text>
      </View>
      <View className="mx-4 mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700">
        <View
          className="h-full rounded-full bg-green-500"
          style={{ width: `${((index + 1) / Math.max(1, steps.length)) * 100}%` }}
        />
      </View>

      {otherTimers.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3 max-h-10 flex-grow-0"
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {otherTimers.map((t) => {
            const state = timerState(t, now);
            return (
              <Pressable
                key={t.key}
                onPress={() => goTo(t.stepIndex)}
                accessibilityRole="button"
                accessibilityLabel={`${t.stepIndex + 1}단계 타이머 ${
                  state === 'done' ? '끝남' : formatClock(remainingMs(t, now) / 1000)
                }, 눌러서 그 단계로`}
                className={`h-9 flex-row items-center gap-1.5 rounded-full border px-3 ${
                  state === 'done' ? 'border-green-400 bg-green-950' : 'border-slate-600'
                }`}>
                <Text className="text-xs text-slate-400">{t.stepIndex + 1}단계</Text>
                <Text
                  className={`font-bold ${state === 'done' ? 'text-green-300' : 'text-amber-300'}`}
                  style={{ fontVariant: ['tabular-nums'] }}>
                  {state === 'done'
                    ? '다 됐어요'
                    : `${state === 'paused' ? '⏸ ' : ''}${formatClock(remainingMs(t, now) / 1000)}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <FlatList
        ref={listRef}
        data={steps}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onSwipeEnd}
        extraData={now}
        keyExtractor={(_, i) => String(i)}
        className="flex-1"
        renderItem={({ item: step, index: stepIndex }) => (
          <ScrollView style={{ width }} contentContainerStyle={{ padding: 20, paddingTop: 24 }}>
            <Text className="mb-3 font-bold text-green-300">{stepIndex + 1}단계</Text>
            <View className="gap-3">
              {step.lines.map((line, i) => (
                <StepPieces
                  key={i}
                  pieces={line}
                  tone="dark"
                  className="text-[22px] font-bold leading-[34px] text-slate-50"
                />
              ))}
            </View>
            {step.tips.map((tip, i) => (
              <View key={i} className="mt-4 flex-row rounded-xl bg-slate-800 px-3 py-2.5">
                <Text className="mr-1.5">💡</Text>
                <StepPieces
                  pieces={tip}
                  tone="tip"
                  className="flex-1 text-[15px] leading-6 text-slate-300"
                />
              </View>
            ))}
            <StepIngredientList
              items={stepIngredients[stepIndex] ?? []}
              amountFactor={amountFactor}
            />
            {step.timer && (
              <TimerCard
                recipeId={id}
                recipeName={recipeName}
                stepIndex={stepIndex}
                timer={step.timer}
                now={now}
              />
            )}
          </ScrollView>
        )}
      />

      <View className="flex-row gap-3 px-4 pt-3">
        <Pressable
          onPress={() => goTo(index - 1)}
          disabled={index === 0}
          accessibilityRole="button"
          accessibilityLabel="이전 단계"
          accessibilityState={{ disabled: index === 0 }}
          className={`min-h-14 flex-1 items-center justify-center rounded-2xl bg-slate-800 ${
            index === 0 ? 'opacity-40' : ''
          }`}>
          <Text className="text-medium font-bold text-slate-300">← 이전</Text>
        </Pressable>
        <Pressable
          onPress={() => (isLast ? close() : goTo(index + 1))}
          accessibilityRole="button"
          accessibilityLabel={isLast ? '완성, 요리 모드 닫기' : '다음 단계'}
          className="min-h-14 flex-[1.4] items-center justify-center rounded-2xl bg-green-500">
          <Text className="text-medium font-bold text-green-950">
            {isLast ? '완성!' : '다음 단계 →'}
          </Text>
        </Pressable>
      </View>
      <Text
        className="pt-2 text-center text-xs text-slate-500"
        style={{ paddingBottom: Math.max(insets.bottom, 8) + 4 }}>
        {keepsScreenOn
          ? '요리하는 동안 화면이 꺼지지 않아요'
          : '좌우로 밀어도 단계를 넘길 수 있어요'}
      </Text>
    </View>
  );
}
