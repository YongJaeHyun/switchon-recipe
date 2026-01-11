import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { FASTING_DAYS, FASTING_START_TIMES, FastingDay, FastingTime } from 'const/fastingDays';
import { useFasting } from 'hooks/useFasting';
import { useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getWeekBorderColor, getWeekColor } from 'utils/getWeekColor';
import { Maybe } from '../../types/common';
import { CustomBottomSheet } from '../common/CustomBottomSheet';

interface DayButtonProps {
  day: FastingDay;
  isSelected: boolean;
  disabled: boolean;
  onPress: (day: number) => void;
}
interface StartTimeButtonProps {
  time: FastingTime;
  isSelected: boolean;
  onPress: (time: FastingTime) => void;
}

const displayDays = [...FASTING_DAYS.slice(1), FASTING_DAYS[0]];

const DayButton = ({ day, isSelected, disabled, onPress }: DayButtonProps) => {
  const dayIndex = FASTING_DAYS.indexOf(day);
  return (
    <RippleButton
      rippleColor="transparent"
      onPress={() => onPress(dayIndex)}
      className={`h-12 w-12 rounded-full ${isSelected ? 'bg-green-600' : 'bg-neutral-100'} ${disabled ? 'opacity-40' : ''}`}
      disabled={disabled}>
      <Text className={`${isSelected ? 'text-white' : 'text-neutral-800'}`}>{day}</Text>
    </RippleButton>
  );
};

const StartTimeButton = ({ time, isSelected, onPress }: StartTimeButtonProps) => {
  return (
    <RippleButton
      rippleColor="transparent"
      onPress={() => onPress(time)}
      outerClassName="flex-1"
      className={`w-full rounded-xl py-3 ${isSelected ? 'bg-green-600' : 'bg-neutral-100'}`}>
      <Text className={`text-center ${isSelected ? 'text-white' : 'text-neutral-800'}`}>
        {time}
      </Text>
    </RippleButton>
  );
};

export const FastingDayBottomSheet = () => {
  const { days, startTime, upsertFasting } = useFasting();
  const week = useWeekCompletePopupStore((state) => state.week);

  const bottomSheetRef = useRef<BottomSheetMethods>(null);

  const selectableDayNum = week - 1; // ex. 2주차 -> 1개 선택 가능
  const [selectedDays, setSelectedDays] = useState<number[]>(days);
  const isDayAllSelected = selectedDays.length >= selectableDayNum;

  const [selectedTime, setSelectedTime] = useState<Maybe<FastingTime>>(startTime);

  const isAllSelected = isDayAllSelected && !!selectedTime;

  const getNextDay = (day: number) => day > 0 && (day + 1) % FASTING_DAYS.length;
  const toggleSelectedDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const convertFastingDayToText = (dayNums: number[]) => {
    const fastingDays = dayNums?.map((dayNum) => FASTING_DAYS[dayNum]);
    return [...fastingDays].join(' & ') + ' ' + startTime;
  };

  const saveFastingDays = () => {
    upsertFasting({
      days: selectedDays,
      start_time: selectedTime,
    });
    bottomSheetRef.current?.close();
  };

  const openSheet = () => {
    bottomSheetRef.current?.expand();
  };

  useEffect(() => {
    setSelectedDays(days);
    setSelectedTime(startTime);
  }, [days, startTime]);

  if (week < 2) return null;
  return (
    <>
      <View className="mt-4 gap-4">
        <View className="flex-row items-center justify-between rounded-xl border border-neutral-300 px-4 py-3">
          <Text className="font-bold">
            <Text className={getWeekColor(week)}>{week}주차 </Text>
            <Text className="text-neutral-800">24시간 단식 요일</Text>
          </Text>
          <RippleButton
            onPress={openSheet}
            outerClassName={`border ${getWeekBorderColor(week)}`}
            className={`rounded-full px-4 py-1.5`}>
            {days.length === 0 ? (
              <Text className={`font-bold ${getWeekColor(week)}`}>설정하기</Text>
            ) : (
              <Text className={`font-bold ${getWeekColor(week)}`}>
                {convertFastingDayToText(days)}
              </Text>
            )}
          </RippleButton>
        </View>
      </View>

      <CustomBottomSheet ref={bottomSheetRef}>
        <BottomSheetView className="px-5">
          <View className="flex-row items-center justify-between">
            <Text className="mb-2 text-2xl font-bold">단식 요일 설정</Text>
          </View>
          <Text className="mb-6 text-neutral-500">
            이번 주에 24시간 단식을 할 요일을 선택해주세요.
          </Text>

          <View className="my-3 gap-3">
            <Text className="font-bold text-green-600">단식 요일</Text>
            <FlatList
              data={displayDays}
              keyExtractor={(item) => `fasting-day-button-${item}`}
              contentContainerClassName="flex-row justify-between"
              renderItem={({ item }) => {
                const dayIndex = FASTING_DAYS.indexOf(item);
                const disabledDays = selectedDays.map((dayIndex) => getNextDay(dayIndex));
                const isDisabled = isDayAllSelected
                  ? !selectedDays.includes(dayIndex)
                  : disabledDays.includes(dayIndex) && !selectedDays.includes(dayIndex);

                return (
                  <DayButton
                    day={item}
                    onPress={toggleSelectedDay}
                    disabled={isDisabled}
                    isSelected={selectedDays.includes(dayIndex)}
                  />
                );
              }}
            />
            {isDayAllSelected ? (
              <Text className="my-4 text-center text-green-600">완벽해요!</Text>
            ) : (
              <Text className="my-4 text-center text-neutral-500">
                {selectableDayNum - selectedDays.length}개를 더 선택해주세요
              </Text>
            )}
          </View>

          <View className="my-3 gap-3">
            <Text className="font-bold text-green-600">단식 시작 시간</Text>
            <View className="w-full flex-row gap-3">
              {FASTING_START_TIMES.map((item) => (
                <StartTimeButton
                  key={`fasting-start-time-button-${item}`}
                  time={item}
                  onPress={setSelectedTime}
                  isSelected={item === selectedTime}
                />
              ))}
            </View>
          </View>

          <RippleButton
            outerClassName="mt-10 mb-10"
            className={`w-full  py-4 ${isAllSelected ? 'bg-green-600' : 'bg-neutral-300'}`}
            onPress={saveFastingDays}
            disabled={!isAllSelected}>
            <Text className="text-lg font-semibold text-white">저장하기</Text>
          </RippleButton>
        </BottomSheetView>
      </CustomBottomSheet>
    </>
  );
};
