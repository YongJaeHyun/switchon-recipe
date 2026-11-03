import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { goalCardTexts, type GoalProgress } from 'utils/weightGoal';

// 기록 탭 > 체중 칸, 그래프 위 "목표까지" 카드. 누르면 목표 바꾸기, 닿았으면 [새 목표 정하기]
export function WeightGoalCard({
  goalKg,
  progress,
  inbodyLines,
  onEdit,
  onNewGoal,
}: {
  goalKg: number;
  progress: GoalProgress | null;
  inbodyLines: string[];
  onEdit(): void;
  onNewGoal(): void;
}) {
  const { title, headline, detail } = goalCardTexts(goalKg, progress);
  const achieved = !!progress?.achieved;
  // 증량 목표는 진행 막대 없이 남은 kg만
  const percent = achieved ? 100 : progress?.percent;

  return (
    <View className="gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityHint="목표를 바꿔요"
        className="gap-1">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 gap-0.5">
            {title && <Text className="text-sm text-neutral-500">{title}</Text>}
            <Text
              className={`font-bold ${achieved ? 'text-xl' : 'text-2xl'} ${
                progress ? 'text-green-600' : 'text-base text-neutral-600'
              }`}>
              {headline}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.neutral[400]} />
        </View>
        {percent != null && (
          <View className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-200">
            <View className="h-full rounded-full bg-green-600" style={{ width: `${percent}%` }} />
          </View>
        )}
        {detail && <Text className="mt-1 text-sm text-neutral-500">{detail}</Text>}
        {inbodyLines.length > 0 && (
          <View className="mt-2 gap-1 border-t border-neutral-100 pt-2">
            {inbodyLines.map((line) => (
              <Text key={line} className="text-xs text-neutral-600">
                {line}
              </Text>
            ))}
          </View>
        )}
      </Pressable>
      {achieved && (
        <RippleButton
          outerClassName="border border-green-600 bg-white"
          className="w-full py-2.5"
          rippleColor={colors.green[100]}
          onPress={onNewGoal}>
          <Text className="font-bold text-green-600">새 목표 정하기</Text>
        </RippleButton>
      )}
    </View>
  );
}

// 목표가 없을 때 같은 자리: "목표 체중을 정해 보세요 [정하기]"
export function WeightGoalPromptCard({ onPress }: { onPress(): void }) {
  return (
    <View
      className="flex-row items-center gap-3 rounded-xl border border-dashed bg-white px-4 py-3.5"
      style={{ borderColor: colors.green[600] }}>
      <View className="flex-1 gap-0.5">
        <Text className="font-bold text-neutral-800">목표 체중을 정해 보세요</Text>
        <Text className="text-sm text-neutral-500">남은 kg과 진행률을 보여 드려요</Text>
      </View>
      <RippleButton
        rounded="full"
        outerClassName="bg-green-600"
        className="px-4 py-2"
        onPress={onPress}>
        <Text className="text-sm font-bold text-white">정하기</Text>
      </RippleButton>
    </View>
  );
}
