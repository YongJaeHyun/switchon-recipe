import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { StatisticsAPI } from 'api/StatisticsAPI';
import { UserAPI } from 'api/UserAPI';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import CustomCalendar from 'components/common/CustomCalendar';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import useKoreanToday from 'hooks/useKoreanToday';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { getWeekAndDay } from 'utils/date';
import { Nullable } from '../../types/common';

interface StartDateBottomSheetProps {
  bottomSheetRef: React.RefObject<Nullable<BottomSheetMethods>>;
}

export function StartDateBottomSheet({ bottomSheetRef }: StartDateBottomSheetProps) {
  const { selectedIngredients: lowIngredients, upsertIngredients: upsertLowIngredients } =
    useSelectedIngredients({ type: 'low' });
  const { selectedIngredients: zeroIngredients, upsertIngredients: upsertZeroIngredients } =
    useSelectedIngredients({ type: 'zero' });

  const today = useKoreanToday();
  const startDate = useUserStore((state) => state.start_date);

  const [calendarKey, setCalendarKey] = useState(false); // 캘린더 리렌더링용 키
  const [selectedDate, setSelectedDate] = useState<string>(startDate ?? today);

  const setDateToToday = () => {
    setSelectedDate(today);
    setCalendarKey((prev) => !prev);
  };

  const updateStartDate = async () => {
    const { week, day } = getWeekAndDay(selectedDate);

    const filteredLowIngredients = lowIngredients.filter((ingredient) => ingredient.week <= week);
    if (lowIngredients.length !== filteredLowIngredients.length) {
      upsertLowIngredients(filteredLowIngredients);
    }

    const filteredZeroIngredients = zeroIngredients.filter((ingredient) => ingredient.week <= week);
    if (zeroIngredients.length !== filteredZeroIngredients.length) {
      upsertZeroIngredients(filteredZeroIngredients);
    }

    await UserAPI.updateStartDate(selectedDate);
    await StatisticsAPI.deleteFrom(week, day);

    bottomSheetRef.current?.close();
  };

  return (
    <CustomBottomSheet ref={bottomSheetRef}>
      <BottomSheetView className="px-5">
        <View className="flex-row items-center justify-between">
          <Text className="mb-2 text-2xl font-bold">시작 날짜 재설정</Text>
          <TouchableOpacity
            className="rounded-lg border border-green-600 px-3 py-2.5"
            onPress={setDateToToday}>
            <Text className="text-green-600">오늘로 설정</Text>
          </TouchableOpacity>
        </View>
        <Text className="mb-6 text-neutral-500">날짜를 선택해주세요</Text>
        <CustomCalendar
          calendarKey={String(calendarKey)}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
        />
        <RippleButton
          outerClassName="mb-10"
          className="w-full bg-green-600 py-4"
          onPress={updateStartDate}>
          <Text className="text-lg font-semibold text-white">날짜 재설정하기</Text>
        </RippleButton>
      </BottomSheetView>
    </CustomBottomSheet>
  );
}
