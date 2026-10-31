import { Text } from 'components/common/Text';
import { TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { getWeekColorHex, getWeekInkHex } from 'utils/getWeekColor';
import { RECIPE_WEEK_CHOICES, weekChoiceLabel } from 'utils/recipeWeekChoice';

interface WeekChipsProps {
  value: number;
  // 지금 주차 (1~5). 다른 주차를 고르면 아래에 한 줄로 알려 준다
  currentWeek: number;
  onChange(week: number): void;
  disabled?: boolean;
  className?: string;
  // 칸과 이름 (기본: 1~4주차·유지기). 먹고 싶은 음식으로 만들기는 1주차 / 2주차 / 3주차+
  choices?: readonly number[];
  labelOf?(week: number): string;
}

// 레시피를 어느 주차 규칙으로 만들지 고른다. 고른 칸만 그 주차 색으로 채우고,
// 지금 주차 칸은 고르지 않았을 때도 주차 색 글자로 남겨 어디가 "지금"인지 보이게 한다
export function WeekChips({
  value,
  currentWeek,
  onChange,
  disabled,
  className,
  choices = RECIPE_WEEK_CHOICES,
  labelOf = weekChoiceLabel,
}: WeekChipsProps) {
  return (
    <View className={className}>
      <View className="flex-row gap-1.5" accessibilityRole="radiogroup">
        {choices.map((week) => {
          const selected = value === week;
          const isCurrent = currentWeek === week;
          return (
            <TouchableOpacity
              key={week}
              disabled={disabled}
              onPress={() => onChange(week)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${labelOf(week)}${isCurrent ? ', 지금 주차' : ''}`}
              className="flex-1 items-center justify-center rounded-full border py-2"
              style={{
                backgroundColor: selected ? getWeekColorHex(week) : colors.white,
                borderColor: selected
                  ? getWeekColorHex(week)
                  : isCurrent
                    ? getWeekInkHex(week)
                    : colors.neutral[200],
              }}>
              <Text
                className={`text-sm ${selected || isCurrent ? 'font-bold' : ''}`}
                style={{
                  // 고른 칸은 흰 글자 (운영자 결정 2026-11-01)
                  color: selected
                    ? colors.white
                    : isCurrent
                      ? getWeekInkHex(week)
                      : colors.neutral[500],
                }}>
                {labelOf(week)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {value !== currentWeek && (
        <Text className="ml-1 mt-1.5 text-xs text-neutral-500">
          지금은 {labelOf(currentWeek)}예요. {labelOf(value)} 규칙으로 만들어요
        </Text>
      )}
    </View>
  );
}
