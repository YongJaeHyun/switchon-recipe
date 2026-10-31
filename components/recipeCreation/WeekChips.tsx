import { Text } from 'components/common/Text';
import { TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { getWeekColorHex, getWeekInkHex, getWeekOnColorHex } from 'utils/getWeekColor';
import { RECIPE_WEEK_CHOICES, weekChoiceLabel } from 'utils/recipeWeekChoice';

interface WeekChipsProps {
  value: number;
  // 지금 주차 (1~5). 다른 주차를 고르면 아래에 한 줄로 알려 준다
  currentWeek: number;
  onChange(week: number): void;
  disabled?: boolean;
  className?: string;
}

// 레시피를 어느 주차 규칙으로 만들지 고른다. 고른 칸만 그 주차 색으로 채우고,
// 지금 주차 칸은 고르지 않았을 때도 주차 색 글자로 남겨 어디가 "지금"인지 보이게 한다
export function WeekChips({ value, currentWeek, onChange, disabled, className }: WeekChipsProps) {
  return (
    <View className={className}>
      <View className="flex-row gap-1.5" accessibilityRole="radiogroup">
        {RECIPE_WEEK_CHOICES.map((week) => {
          const selected = value === week;
          const isCurrent = currentWeek === week;
          return (
            <TouchableOpacity
              key={week}
              disabled={disabled}
              onPress={() => onChange(week)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${weekChoiceLabel(week)}${isCurrent ? ', 지금 주차' : ''}`}
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
                  color: selected
                    ? getWeekOnColorHex(week)
                    : isCurrent
                      ? getWeekInkHex(week)
                      : colors.neutral[500],
                }}>
                {weekChoiceLabel(week)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {value !== currentWeek && (
        <Text className="ml-1 mt-1.5 text-xs text-neutral-500">
          지금은 {weekChoiceLabel(currentWeek)}예요. {weekChoiceLabel(value)} 규칙으로 만들어요
        </Text>
      )}
    </View>
  );
}
