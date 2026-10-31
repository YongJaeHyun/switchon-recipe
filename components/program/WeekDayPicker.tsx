import { Text } from 'components/common/Text';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';
import {
  getWeekBGColor,
  getWeekBorderColor,
  getWeekInkHex,
  getWeekOnColorHex,
} from 'utils/getWeekColor';
import { MAINTENANCE_WEEK } from 'utils/programStart';

interface WeekDayPickerProps {
  week: number;
  day: number;
  onChange: (selection: { week: number; day: number }) => void;
  disabled?: boolean;
}

const WEEKS = [1, 2, 3, 4, MAINTENANCE_WEEK];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

// 큰 글꼴 설정에서도 좁은 칩(약 40~59dp) 안에 한 줄로 들어가게
const LABEL_FONT_SCALE_MAX = 1.2;

const weekLabel = (week: number) => (week >= MAINTENANCE_WEEK ? '유지기' : `${week}주차`);

// "지금 몇 주차 며칠인가요?" — 주차 칩(1~4주차·유지기)과 일차 칩(1~7일). 주차마다 그 주차 색을 쓴다
// (테두리·채움은 주차 색, 글자는 대비 4.5:1 이상인 getWeekOnColorHex·getWeekInkHex).
// 유지기는 일차를 따지지 않아 일차 칩 대신 안내 한 줄을 보여 준다 (5주차 1일로 계산)
export function WeekDayPicker({ week, day, onChange, disabled }: WeekDayPickerProps) {
  const isMaintenance = week >= MAINTENANCE_WEEK;

  return (
    <View className="gap-2.5">
      <View className="flex-row gap-1.5">
        {WEEKS.map((w) => {
          const selected = w === week;
          return (
            <Pressable
              key={w}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={weekLabel(w)}
              onPress={() => onChange({ week: w, day: w >= MAINTENANCE_WEEK ? 1 : day })}
              className={`h-11 flex-1 items-center justify-center rounded-full border-2 ${getWeekBorderColor(w)} ${
                selected ? getWeekBGColor(w) : 'bg-white'
              }`}>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={LABEL_FONT_SCALE_MAX}
                className="text-base font-bold"
                style={{ color: selected ? getWeekOnColorHex(w) : getWeekInkHex(w) }}>
                {weekLabel(w)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isMaintenance ? (
        <View className="h-11 justify-center rounded-xl bg-neutral-100 px-4">
          <Text maxFontSizeMultiplier={LABEL_FONT_SCALE_MAX} className="text-neutral-600">
            유지기는 일차 없이 이어서 해요
          </Text>
        </View>
      ) : (
        <View className="flex-row gap-1.5">
          {DAYS.map((d) => {
            const selected = d === day;
            const passed = d < day;
            return (
              <Pressable
                key={d}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled }}
                accessibilityLabel={`${d}일`}
                onPress={() => onChange({ week, day: d })}
                className={`h-11 flex-1 items-center justify-center rounded-xl ${
                  selected
                    ? getWeekBGColor(week)
                    : passed
                      ? `border ${getWeekBorderColor(week)} bg-white`
                      : 'bg-neutral-100'
                }`}>
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={LABEL_FONT_SCALE_MAX}
                  className="font-semibold"
                  style={{
                    color: selected
                      ? getWeekOnColorHex(week)
                      : passed
                        ? getWeekInkHex(week)
                        : colors.neutral[600],
                  }}>
                  {d}일
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
