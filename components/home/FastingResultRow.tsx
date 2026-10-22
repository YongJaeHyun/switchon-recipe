import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { useFastingResult } from 'hooks/useFastingResult';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { fastingResultQuestion } from 'utils/todayRows';

// 오늘 할 일 목록의 단식 결과 줄 (단식이 끝난 뒤 응답 창 안에서만).
// 답하면 결과 + 바꾸기로 바뀐다. 식단 완료율에는 넣지 않는다
export function FastingResultRow({ day, now }: { day: string; now: Date }) {
  const { result, isLoading, saveResult, isSaving } = useFastingResult(day);
  if (isLoading) return null;

  if (result) {
    return (
      <View className="flex-row items-center gap-4 py-2">
        <MaterialIcons name="timer" size={20} color={colors.indigo[500]} />
        <Text className="flex-1 text-neutral-800">
          {result === 'success' ? '✅ 성공으로 기록했어요' : '🍽️ 중간에 먹었다고 기록했어요'}
        </Text>
        <Pressable
          hitSlop={8}
          disabled={isSaving}
          onPress={() => saveResult(result === 'success' ? 'broken' : 'success')}>
          <Text className="text-sm text-neutral-400">바꾸기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-4 py-2">
      <MaterialIcons name="timer" size={20} color={colors.indigo[500]} />
      <Text className="flex-1 text-neutral-800">{fastingResultQuestion(day, now)}</Text>
      <View className="flex-row gap-1.5">
        <RippleButton
          disabled={isSaving}
          rounded="full"
          outerClassName="bg-indigo-500"
          className="px-3 py-1.5"
          onPress={() => saveResult('success')}>
          <Text className="text-sm font-bold text-white">성공</Text>
        </RippleButton>
        <RippleButton
          disabled={isSaving}
          rounded="full"
          outerClassName="border border-neutral-300 bg-white"
          className="px-3 py-1.5"
          rippleColor={colors.neutral[200]}
          onPress={() => saveResult('broken')}>
          <Text className="text-sm font-bold text-neutral-600">중간에 먹음</Text>
        </RippleButton>
      </View>
    </View>
  );
}
