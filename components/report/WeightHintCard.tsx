import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import type { WeightHintState } from 'utils/reportVisual';
import { ON_DEMAND_MESSAGES } from 'utils/reportOnDemand';

// 리포트 체중 칸 아래 안내. missing: 빠진 날을 적으러 가기 / added: 기록이 늘었으니 여기서 글 다시 받기.
// 다시 받기는 화면의 다시 만들기 흐름(같은 API·하루 상한·오류 안내)을 그대로 쓴다
export function WeightHintCard({
  state,
  onWrite,
  onRegenerate,
  pending,
  limited,
  error,
}: {
  state: WeightHintState;
  onWrite(): void;
  onRegenerate(): void;
  pending: boolean;
  limited: boolean;
  error: { message: string; retryable: boolean } | null;
}) {
  if (state.kind === 'missing') {
    return (
      <View className="gap-3 rounded-xl bg-neutral-50 p-4">
        <View className="flex-row gap-2">
          <MaterialIcons name="monitor-weight" size={20} color={colors.green[600]} />
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-bold text-neutral-800">
              {state.daysLogged === 0
                ? '이 주 체중 기록이 없어요'
                : `이 주 체중을 ${state.daysLogged}일만 적었어요`}
            </Text>
            <Text className="text-sm text-neutral-600">빠진 날을 적으면 숫자는 바로 바뀌어요</Text>
          </View>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onWrite}
          className="items-center rounded-lg border border-green-600 bg-white py-3">
          <Text className="font-bold text-green-600">체중 적으러 가기</Text>
        </TouchableOpacity>
        <Text className="text-xs text-neutral-500">
          다 적고 오면 여기서 글도 새로 받을 수 있어요
        </Text>
      </View>
    );
  }

  const disabled = pending || limited;
  return (
    <View className="gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
      <View className="flex-row gap-2">
        <MaterialIcons name="check-circle" size={20} color={colors.green[600]} />
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-bold text-neutral-800">
            기록이 더해졌어요 ({state.before}일 → {state.after}일)
          </Text>
          <Text className="text-sm text-neutral-600">
            {pending ? '30초쯤 걸릴 수 있어요' : '요약·잘한 점·체중 해석을 새 기록으로 다시 써요'}
          </Text>
        </View>
      </View>
      {error && !error.retryable ? null : (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled, busy: pending }}
          disabled={disabled}
          onPress={onRegenerate}
          className={`flex-row items-center justify-center gap-2 rounded-lg py-3 ${
            pending ? 'bg-green-100' : limited ? 'bg-neutral-200' : 'bg-green-600'
          }`}>
          {pending && <ActivityIndicator size="small" color={colors.green[700]} />}
          <Text
            className={`font-bold ${
              pending ? 'text-green-700' : limited ? 'text-neutral-400' : 'text-white'
            }`}>
            {pending ? '다시 쓰는 중' : '글 다시 받기'}
          </Text>
        </TouchableOpacity>
      )}
      {limited ? (
        <Text className="text-sm text-neutral-500">{ON_DEMAND_MESSAGES.daily_limit}</Text>
      ) : (
        !!error && <Text className="text-sm text-red-600">{error.message}</Text>
      )}
    </View>
  );
}
