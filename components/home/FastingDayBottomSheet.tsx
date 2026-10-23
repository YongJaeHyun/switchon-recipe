import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { FASTING_DAYS, FASTING_START_TIMES, FastingDay, FastingTime } from 'const/fastingDays';
import { useFasting } from 'hooks/useFasting';
import { RefObject, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { nextFastingDays } from 'utils/fastingDaySelect';
import { Maybe, Nullable } from '../../types/common';
import { CustomBottomSheet } from '../common/CustomBottomSheet';

interface DayButtonProps {
  day: FastingDay;
  isSelected: boolean;
  disabled: boolean;
  onPress: (day: number) => void;
}
interface FastingDayBottomSheetProps {
  bottomSheetRef: RefObject<Nullable<BottomSheetMethods>>;
  // 줄(FastingDayLine)과 같은 주차 (시작일로 계산). 팝업 store 주차는 자정·앱 복귀 검증 전까지 늦을 수 있다
  week: number;
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

// 단식 요일 설정 시트. 여는 줄은 FastingDayLine (오늘 탭 목록 아래)
export const FastingDayBottomSheet = ({ bottomSheetRef, week }: FastingDayBottomSheetProps) => {
  const { days, startTime, upsertFasting } = useFasting();

  const selectableDayNum = week - 1; // ex. 2주차 -> 1개 선택 가능
  const [selectedDays, setSelectedDays] = useState<number[]>(days);
  const isDayAllSelected = selectedDays.length >= selectableDayNum;

  const [selectedTime, setSelectedTime] = useState<Maybe<FastingTime>>(startTime);

  const isAllSelected = isDayAllSelected && !!selectedTime;

  // 다 고른 상태에서 다른 요일을 누르면 가장 먼저 고른 요일과 바뀐다 (이틀 연속은 안 됨)
  const toggleSelectedDay = (day: number) => {
    const next = nextFastingDays(selectedDays, day, selectableDayNum);
    if (next) setSelectedDays(next);
  };

  const saveFastingDays = () => {
    upsertFasting({
      days: selectedDays,
      start_time: selectedTime,
    });
    bottomSheetRef.current?.close();
  };
  const handleReset = () => {
    setSelectedDays([]);
    setSelectedTime(null);
  };

  useEffect(() => {
    setSelectedDays(days);
    setSelectedTime(startTime);
  }, [days, startTime]);

  return (
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
              const isDisabled = nextFastingDays(selectedDays, dayIndex, selectableDayNum) === null;

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
            <View className="my-4 items-center gap-1">
              <Text className="text-center text-green-600">완벽해요!</Text>
              <Text className="text-center text-sm text-neutral-400">
                다른 요일을 누르면 바로 바뀌어요
              </Text>
            </View>
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

        <View className="flex-row gap-2">
          <RippleButton
            outerClassName="my-10 !flex-[3.5] border border-green-600"
            onPress={handleReset}>
            <Text className="text-lg font-semibold text-green-600">설정 초기화</Text>
          </RippleButton>
          <RippleButton
            outerClassName="my-10 !flex-[6.5]"
            className={`w-full py-4 ${isAllSelected ? 'bg-green-600' : 'bg-neutral-300'}`}
            onPress={saveFastingDays}
            disabled={!isAllSelected}>
            <Text className="text-lg font-semibold text-white">저장하기</Text>
          </RippleButton>
        </View>
      </BottomSheetView>
    </CustomBottomSheet>
  );
};
