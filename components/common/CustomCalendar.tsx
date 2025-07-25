import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { updateStartDateToDB } from 'api/supabaseAPI';
import useKoreanToday from 'hooks/useKoreanToday';
import { useState } from 'react';
import { Text, TouchableHighlight, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { getWeekAndDay } from 'utils/date';

interface CustomCalendarProps {
  bottomSheetRef?: React.RefObject<BottomSheetMethods>;
}

export default function CustomCalendar({ bottomSheetRef }: CustomCalendarProps) {
  const userInfo = useUserStore((state) => state.user);
  const today = useKoreanToday();

  const [selectedDate, setSelectedDate] = useState<string>(userInfo.start_date ?? today);
  const [calendarKey, setCalendarKey] = useState(0); // 캘린더 리렌더링용 키
  const { week, day } = getWeekAndDay(selectedDate, today);

  const setDateToToday = () => {
    setSelectedDate(today);
    setCalendarKey((prev) => prev + 1);
  };

  const updateStartDate = async () => {
    await updateStartDateToDB(selectedDate);
    if (bottomSheetRef) {
      bottomSheetRef.current.close();
    }
  };
  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Text className="mb-2 text-2xl font-semibold">시작 날짜 재설정</Text>
        <TouchableOpacity
          className="rounded-lg border border-green-600 px-3 py-2.5"
          onPress={setDateToToday}>
          <Text className="text-green-600">오늘로 설정</Text>
        </TouchableOpacity>
      </View>
      <Text className="mb-6">날짜를 선택해주세요</Text>

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
        <Text className="text-lg">{week}주차</Text>
        <Text className="text-lg">{day}일부터 시작해요</Text>
      </View>

      <TouchableHighlight onPress={updateStartDate}>
        <View className="items-center rounded-lg bg-green-600 py-4">
          <Text className="text-lg font-semibold text-white">날짜 재설정하기</Text>
        </View>
      </TouchableHighlight>
    </View>
  );
}
