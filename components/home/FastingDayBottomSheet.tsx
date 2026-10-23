import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import RippleButton from 'components/common/RippleButton';
import { StepSlider } from 'components/common/StepSlider';
import { Text } from 'components/common/Text';
import { FASTING_DAYS, FastingDay } from 'const/fastingDays';
import { useFasting } from 'hooks/useFasting';
import { RefObject, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  DEFAULT_START_MINUTES,
  fastingDayRowLabel,
  sheetDaysOrdered,
  withNewDays,
} from 'utils/fastingDaySheet';
import { nextFastingDays } from 'utils/fastingDaySelect';
import {
  FASTING_SLIDER,
  formatMinutes,
  QUICK_TIMES,
  type FastingSchedule,
} from 'utils/fastingSchedule';
import { Nullable } from '../../types/common';
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
interface DayStartTimeRowProps {
  day: number;
  minutes: number;
  onChange: (day: number, minutes: number) => void;
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

// 요일 하나의 시작 시각: "목요일 · 19:00 시작 → 금 19:00 끝", 슬라이더, 빠른 선택
const DayStartTimeRow = ({ day, minutes, onChange }: DayStartTimeRowProps) => {
  return (
    <View className="gap-1 rounded-xl border border-neutral-100 bg-white px-3 py-3">
      <Text className="text-sm font-bold text-neutral-800">{fastingDayRowLabel(day, minutes)}</Text>
      <StepSlider
        value={minutes}
        min={FASTING_SLIDER.min}
        max={FASTING_SLIDER.max}
        step={FASTING_SLIDER.step}
        onChange={(next) => onChange(day, next)}
        accessibilityLabel={`${FASTING_DAYS[day]}요일 단식 시작 시각`}
        formatValue={formatMinutes}
      />
      <View className="w-full flex-row gap-2">
        {QUICK_TIMES.map((quick) => {
          const isSelected = quick.minutes === minutes;
          return (
            <RippleButton
              key={`fasting-quick-time-${day}-${quick.label}`}
              rippleColor="transparent"
              onPress={() => onChange(day, quick.minutes)}
              outerClassName="flex-1"
              className={`w-full rounded-xl py-2 ${isSelected ? 'bg-green-600' : 'bg-neutral-100'}`}>
              <Text
                className={`text-center text-sm ${isSelected ? 'text-white' : 'text-neutral-800'}`}>
                {quick.label}
              </Text>
            </RippleButton>
          );
        })}
      </View>
    </View>
  );
};

// 단식 요일 설정 시트. 여는 줄은 FastingDayLine (오늘 탭 목록 아래)
export const FastingDayBottomSheet = ({ bottomSheetRef, week }: FastingDayBottomSheetProps) => {
  const { days, schedule, upsertFasting } = useFasting();

  const selectableDayNum = week - 1; // ex. 2주차 -> 1개 선택 가능
  const [selectedDays, setSelectedDays] = useState<number[]>(days);
  const [selectedSchedule, setSelectedSchedule] = useState<FastingSchedule>(() =>
    withNewDays(schedule, days, undefined)
  );
  // 이 시트에서 직전에 정한 시각. 새 요일의 기본값 (없으면 19:00)
  const [lastSetMinutes, setLastSetMinutes] = useState<number | undefined>(undefined);
  const isAllSelected = selectedDays.length >= selectableDayNum;

  // 다 고른 상태에서 다른 요일을 누르면 가장 먼저 고른 요일과 바뀐다 (이틀 연속은 안 됨)
  const toggleSelectedDay = (day: number) => {
    const next = nextFastingDays(selectedDays, day, selectableDayNum);
    if (!next) return;
    setSelectedDays(next);
    setSelectedSchedule((prev) => withNewDays(prev, next, lastSetMinutes));
  };
  const changeStartTime = (day: number, minutes: number) => {
    setSelectedSchedule((prev) => ({ ...prev, [day]: minutes }));
    setLastSetMinutes(minutes);
  };

  const saveFastingDays = () => {
    upsertFasting({
      days: selectedDays,
      schedule: withNewDays(selectedSchedule, selectedDays, lastSetMinutes),
    });
    bottomSheetRef.current?.close();
  };
  const handleReset = () => {
    setSelectedDays([]);
    setSelectedSchedule({});
    setLastSetMinutes(undefined);
  };

  useEffect(() => {
    setSelectedDays(days);
    setSelectedSchedule(withNewDays(schedule, days, undefined));
    setLastSetMinutes(undefined);
  }, [days, schedule]);

  return (
    <CustomBottomSheet ref={bottomSheetRef}>
      <BottomSheetScrollView className="px-5">
        <View className="flex-row items-center justify-between">
          <Text className="mb-2 text-2xl font-bold">단식 요일 설정</Text>
        </View>
        <Text className="mb-4 text-neutral-500">
          이번 주에 24시간 단식을 할 요일과 시작 시각을 정해주세요.
        </Text>

        <View className="my-2 gap-3">
          <Text className="font-bold text-green-600">단식 요일</Text>
          {/* FlatList 칸은 다시 그려지지 않을 때가 있어 옛 상태(직전 시각)로 눌렸다. 7개라 그냥 그린다 */}
          <View className="flex-row justify-between">
            {displayDays.map((item) => {
              const dayIndex = FASTING_DAYS.indexOf(item);
              const isDisabled = nextFastingDays(selectedDays, dayIndex, selectableDayNum) === null;

              return (
                <DayButton
                  key={`fasting-day-button-${item}`}
                  day={item}
                  onPress={toggleSelectedDay}
                  disabled={isDisabled}
                  isSelected={selectedDays.includes(dayIndex)}
                />
              );
            })}
          </View>
          {isAllSelected ? (
            <View className="my-2 items-center gap-1">
              <Text className="text-center text-green-600">완벽해요!</Text>
              <Text className="text-center text-sm text-neutral-400">
                다른 요일을 누르면 바로 바뀌어요
              </Text>
            </View>
          ) : (
            <Text className="my-2 text-center text-neutral-500">
              {selectableDayNum - selectedDays.length}개를 더 선택해주세요
            </Text>
          )}
        </View>

        {selectedDays.length > 0 && (
          <View className="my-2 gap-2">
            <Text className="font-bold text-green-600">단식 시작 시각</Text>
            {sheetDaysOrdered(selectedDays).map((day) => (
              <DayStartTimeRow
                key={`fasting-start-time-row-${day}`}
                day={day}
                minutes={selectedSchedule[day] ?? lastSetMinutes ?? DEFAULT_START_MINUTES}
                onChange={changeStartTime}
              />
            ))}
          </View>
        )}

        <View className="flex-row gap-2">
          <RippleButton
            outerClassName="my-6 !flex-[3.5] border border-green-600"
            onPress={handleReset}>
            <Text className="text-lg font-semibold text-green-600">설정 초기화</Text>
          </RippleButton>
          <RippleButton
            outerClassName="my-6 !flex-[6.5]"
            className={`w-full py-4 ${isAllSelected ? 'bg-green-600' : 'bg-neutral-300'}`}
            onPress={saveFastingDays}
            disabled={!isAllSelected}>
            <Text className="text-lg font-semibold text-white">저장하기</Text>
          </RippleButton>
        </View>
      </BottomSheetScrollView>
    </CustomBottomSheet>
  );
};
