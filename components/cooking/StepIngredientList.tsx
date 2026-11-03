import { Text } from 'components/common/Text';
import { View } from 'react-native';
import { scaleAmount } from 'utils/scaleAmount';
import type { StepIngredient } from 'utils/stepIngredients';

// 요리 모드: 이 단계 문장에 나온 재료만 (상세 화면에서 고른 인분을 반영한 양).
// 양은 단계 문장에 적힌 양이 있으면 그 양, 없으면 재료 목록의 전체 양
export function StepIngredientList({
  items,
  amountFactor,
}: {
  items: StepIngredient[];
  amountFactor: number;
}) {
  if (items.length === 0) return null;
  return (
    <View className="mt-6 rounded-2xl bg-slate-800/70 px-4 py-3" accessibilityLabel="이 단계 재료">
      <Text className="mb-1 text-xs font-bold text-slate-400">이 단계 재료</Text>
      {items.map((item, i) => (
        <View
          key={`${item.name}${i}`}
          className={`flex-row items-center justify-between py-2 ${
            i > 0 ? 'border-t border-slate-700' : ''
          }`}>
          <View className="flex-1 flex-row items-center gap-2 pr-3">
            <Text className="text-[17px] font-bold text-slate-50">{item.name}</Text>
            {item.isOptional && (
              <View className="rounded-full bg-slate-700 px-2 py-0.5">
                <Text className="text-xs text-slate-300">선택</Text>
              </View>
            )}
          </View>
          {item.amount !== null && (
            <View className="items-end">
              <Text className="text-[17px] font-bold text-green-300">
                {scaleAmount(item.amount, amountFactor)}
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
