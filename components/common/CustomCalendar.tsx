import { Text } from 'components/common/Text';
import useKoreanToday from 'hooks/useKoreanToday';
import { View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import colors from 'tailwindcss/colors';
import { getWeekAndDay } from 'utils/date';
import { getWeekColor } from 'utils/getWeekColor';

interface CustomCalendarProps {
  calendarKey?: React.Key;
  selectedDate: string;
  setSelectedDate: React.Dispatch<React.SetStateAction<string>>;
}

export default function CustomCalendar({
  selectedDate,
  setSelectedDate,
  calendarKey,
}: CustomCalendarProps) {
  const today = useKoreanToday();

  const { week, day } = getWeekAndDay(selectedDate);
  return (
    <View>
      <Calendar
        key={calendarKey}
        current={selectedDate}
        maxDate={today}
        onDayPress={(day) => {
          setSelectedDate(day.dateString);
        }}
        markedDates={{
          [selectedDate]: {
            selected: true,
            selectedColor: colors.green[600],
          },
        }}
        theme={{
          selectedDayBackgroundColor: colors.green[600],
          todayTextColor: colors.green[600],
          arrowColor: colors.green[600],
        }}
      />

      <View className="my-6 flex-row justify-center gap-1">
        <Text className={`text-lg ${getWeekColor(week)}`}>{week}주차</Text>
        <Text className="text-lg">{day}일부터 시작해요</Text>
      </View>
    </View>
  );
}
