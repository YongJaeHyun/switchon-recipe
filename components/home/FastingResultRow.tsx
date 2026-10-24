import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { useFastingResult } from 'hooks/useFastingResult';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { fastingResultLabel } from 'utils/fastingEarlyEnd';
import { fastingResultQuestion } from 'utils/todayRows';
import { FastedHoursPicker } from './FastedHoursPicker';

// 단식 후 첫 끼: 고단백 레시피 만들기 (예전 단식 완료 카드 버튼)
const FirstMealButton = () => (
  <RippleButton
    rounded="full"
    outerClassName="ml-9 self-start bg-green-600"
    className="flex-row items-center gap-1 px-3 py-1.5"
    onPress={() => router.push('/recipeCreation/zero')}>
    <MaterialIcons name="restaurant" size={13} color={colors.white} />
    <Text className="text-sm font-bold text-white">단식 후 첫 끼 고단백 레시피 만들기</Text>
  </RippleButton>
);

// 오늘 할 일 목록의 단식 결과 줄 (단식이 끝난 뒤 응답 창 안, 또는 진행 중에 일찍 끝냈을 때).
// 답하면 완료 표시 + 결과 + 바꾸기로 바뀐다. 바꾸기는 답(성공 / 일찍 끝냈어요)을 다시 고르게 한다.
// 단식이 아직 24시간 안(cancelable)이면 바꾸기 대신 취소: 결과를 지우고 진행 줄로 돌아간다.
// 바꾸는 중에는 취소로 저장하지 않고 저장된 표시로 돌아간다.
// "일찍 끝냈어요"는 아래에 시·분 휠(저장된 시간, 없으면 16시간)을 열고 저장한다. 식단 완료율에는 넣지 않는다
export function FastingResultRow({
  day,
  now,
  cancelable = false,
}: {
  day: string;
  now: Date;
  cancelable?: boolean;
}) {
  const { result, fastedMinutes, isLoading, saveResult, cancelResult, isSaving } =
    useFastingResult(day);
  const [isEditing, setEditing] = useState(false);
  const [isPickingHours, setPickingHours] = useState(false);
  if (isLoading) return null;

  // 바꾸기 취소: 저장하지 않고 저장된 결과 표시로 돌아간다 (저장이 끝났을 때도)
  const stopEditing = () => {
    setEditing(false);
    setPickingHours(false);
  };
  const done = (row: unknown) => {
    if (!row) return; // 실패 안내는 API가 했다
    stopEditing();
  };
  const saveSuccess = () => saveResult({ result: 'success' }, { onSuccess: done });
  const saveEarlyEnd = (minutes: number) =>
    saveResult({ result: 'broken', fastedMinutes: minutes }, { onSuccess: done });

  if (result && !isEditing) {
    return (
      <View className="pb-2">
        <View className="flex-row items-center gap-4 py-2">
          <MaterialIcons name="check-circle" size={20} color={colors.green[600]} />
          <Text className="flex-1 text-neutral-800">
            {fastingResultLabel(result, fastedMinutes)}
          </Text>
          <Pressable
            hitSlop={8}
            disabled={isSaving}
            onPress={() => (cancelable ? cancelResult() : setEditing(true))}>
            <Text className="text-sm text-neutral-400">{cancelable ? '취소' : '바꾸기'}</Text>
          </Pressable>
        </View>
        <FirstMealButton />
      </View>
    );
  }

  return (
    <View className="pb-2">
      <View className="flex-row items-center gap-4 py-2">
        <MaterialIcons name="radio-button-unchecked" size={20} color={colors.neutral[400]} />
        <Text className="flex-1 text-neutral-800">{fastingResultQuestion(day, now)}</Text>
        <View className="flex-row gap-1.5">
          <RippleButton
            disabled={isSaving}
            rounded="full"
            outerClassName="bg-green-600"
            className="px-3 py-1.5"
            onPress={saveSuccess}>
            <Text className="text-sm font-bold text-white">성공</Text>
          </RippleButton>
          <RippleButton
            disabled={isSaving}
            rounded="full"
            outerClassName={`border ${isPickingHours ? 'border-green-600 bg-green-50' : 'border-neutral-300 bg-white'}`}
            className="px-3 py-1.5"
            rippleColor={colors.neutral[200]}
            onPress={() => setPickingHours((open) => !open)}>
            <Text className="text-sm font-bold text-neutral-600">일찍 끝냈어요</Text>
          </RippleButton>
        </View>
      </View>
      {isPickingHours && (
        <View className="mb-2 ml-9">
          <FastedHoursPicker
            initialMinutes={fastedMinutes}
            disabled={isSaving}
            onSave={saveEarlyEnd}
          />
        </View>
      )}
      {result && isEditing && (
        <Pressable
          hitSlop={8}
          disabled={isSaving}
          onPress={stopEditing}
          className="mb-2 self-end"
          accessibilityRole="button"
          accessibilityLabel="바꾸기 취소">
          <Text className="text-sm text-neutral-400">취소</Text>
        </Pressable>
      )}
      <FirstMealButton />
    </View>
  );
}
