import { Text } from 'components/common/Text';
import { TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { getWeekColorHex, getWeekInkHex } from 'utils/getWeekColor';
import {
  defaultNameWeekChoice,
  NAME_WEEK_CHOICES,
  nameRequestWeek,
  nameWeekLabel,
} from 'utils/recipeWeekChoice';

interface WeekChipsProps {
  // 실제 규칙 주차 (1~4, 5 = 유지기). 칸은 1주차 / 2주차 / 3주차+ 셋이고 3주차+는 3 이상을 모두 묶는다
  value: number;
  // 지금 주차 (1~5). 다른 주차를 고르면 아래에 한 줄로 알려 준다
  currentWeek: number;
  // 고른 칸의 실제 규칙 주차: 3주차+를 고르면 지금이 3주차 이후일 때 지금 주차, 아니면 3 (nameRequestWeek)
  onChange(week: number): void;
  disabled?: boolean;
  className?: string;
}

// 레시피를 어느 주차 규칙으로 만들지 고른다. 레시피 주차와 같은 1주차 / 2주차 / 3주차+ 세 칸 (운영자 결정 2026-11-01,
// 재료로 만들기·먹고 싶은 음식으로 만들기 모두 이 컴포넌트 하나를 쓴다). 고른 칸만 그 주차 색으로 채우고,
// 지금 주차 칸은 고르지 않았을 때도 주차 색 글자로 남겨 어디가 "지금"인지 보이게 한다
export function WeekChips({ value, currentWeek, onChange, disabled, className }: WeekChipsProps) {
  const selectedChoice = defaultNameWeekChoice(value);
  const currentChoice = defaultNameWeekChoice(currentWeek);
  const labelOf = nameWeekLabel;
  return (
    <View className={className}>
      <View className="flex-row gap-1.5" accessibilityRole="radiogroup">
        {NAME_WEEK_CHOICES.map((week) => {
          const selected = selectedChoice === week;
          const isCurrent = currentChoice === week;
          return (
            <TouchableOpacity
              key={week}
              disabled={disabled}
              onPress={() => onChange(nameRequestWeek(week, currentWeek))}
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
      {selectedChoice !== currentChoice && (
        <Text className="ml-1 mt-1.5 text-xs text-neutral-500">
          지금은 {labelOf(currentChoice)}예요. {labelOf(selectedChoice)} 규칙으로 만들어요
        </Text>
      )}
    </View>
  );
}
