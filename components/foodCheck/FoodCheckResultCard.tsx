import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import type { FoodCheckRecord } from 'types/foodCheck';
import { basisLabel, verdictLabel } from 'utils/foodCheckDisplay';

interface FoodCheckResultCardProps {
  check: FoodCheckRecord;
  // 추정 판정일 때 [성분표 찍고 더 정확히 보기]
  onCheckLabel?(): void;
  disabled?: boolean;
}

// 판정 결과: 점수(큰 숫자) + 판정 + 근거 + 이유 + (피하세요) 대체 추천 + (추정) 성분표 다시 보기
export function FoodCheckResultCard({ check, onCheckLabel, disabled }: FoodCheckResultCardProps) {
  const isAvoid = check.verdict === 'avoid';
  const accent = isAvoid ? 'text-red-500' : 'text-green-600';
  const reasons = check.reasons ?? [];
  const alternatives = check.alternatives ?? [];
  const basis = basisLabel(check.basis);

  return (
    <View className="gap-4 rounded-xl border border-neutral-200 bg-white p-5">
      {check.productName && (
        <Text className="text-lg font-bold text-neutral-800">{check.productName}</Text>
      )}

      <View className="flex-row items-end gap-3">
        <View className="flex-row items-end">
          <Text className={`text-6xl font-bold leading-[64px] ${accent}`}>
            {check.score ?? '-'}
          </Text>
          <Text className="pb-2 text-lg text-neutral-400">/10</Text>
        </View>
        <View className="gap-1 pb-2">
          <Text className={`text-2xl font-bold ${accent}`}>{verdictLabel(check.verdict)}</Text>
          {basis ? (
            <View className="self-start rounded-full bg-neutral-100 px-2 py-0.5">
              <Text className="text-xs text-neutral-500">{basis}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {reasons.length > 0 && (
        <View className="gap-1.5">
          {reasons.map((reason, i) => (
            <View key={`${i}-${reason}`} className="flex-row gap-2">
              <Text className="text-neutral-400">•</Text>
              <Text className="flex-1 leading-6 text-neutral-700">{reason}</Text>
            </View>
          ))}
        </View>
      )}

      {isAvoid && alternatives.length > 0 && (
        <View className="gap-2">
          <Text className="font-bold text-neutral-700">대신 이건 어때요?</Text>
          <View className="flex-row flex-wrap gap-2">
            {alternatives.map((item, i) => (
              <View
                key={`${i}-${item}`}
                className="rounded-full border border-green-600 bg-green-50 px-3 py-1.5">
                <Text className="text-green-700">{item}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {check.basis === 'estimate' && onCheckLabel && (
        <RippleButton
          outerClassName="bg-green-600"
          className="w-full flex-row gap-2 py-3"
          disabled={disabled}
          onPress={onCheckLabel}>
          <MaterialIcons name="photo-camera" size={20} color={colors.white} />
          <Text className="font-bold text-white">성분표 찍고 더 정확히 보기</Text>
        </RippleButton>
      )}
    </View>
  );
}
