import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { FASTING_DAYS, type FastingTime } from 'const/fastingDays';
import { useRef } from 'react';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { FastingDayBottomSheet } from './FastingDayBottomSheet';

// 한국식 달력 순서 (월~일). FASTING_DAYS 인덱스는 0 = 일요일
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// 이번 주 단식 요일. 정했으면 할 일 카드 아래 요일 카드, 아직이면 할 일 카드 위에 눈에 띄는 안내 카드 (단식이 있는 주차에서만). 누르면 단식 요일 설정 시트
export function FastingDayLine({
  state,
  week,
  days,
  startTime,
}: {
  state: 'set' | 'unset';
  week: number;
  days: number[];
  startTime: FastingTime | null | undefined;
}) {
  const sheetRef = useRef<BottomSheetMethods>(null);
  const open = () => sheetRef.current?.expand();
  const timesPerWeek = week - 1; // 2주차 1회, 3주차 2회, 4주차 3회

  return (
    <>
      {state === 'set' ? (
        <Pressable
          onPress={open}
          className="gap-3 rounded-xl border border-green-100 bg-white px-4 py-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-neutral-900">
              이번 주 단식 <Text className="text-sm text-neutral-500">주 {timesPerWeek}회</Text>
            </Text>
            <Text className="text-sm font-bold text-green-600">바꾸기</Text>
          </View>
          <View className="flex-row justify-between">
            {WEEK_ORDER.map((day) => {
              const isFastingDay = days.includes(day);
              return (
                <View
                  key={day}
                  className={`h-9 w-9 items-center justify-center rounded-full ${
                    isFastingDay ? 'bg-green-600' : 'bg-neutral-100'
                  }`}>
                  <Text
                    className={`text-sm ${isFastingDay ? 'font-bold text-white' : 'text-neutral-400'}`}>
                    {FASTING_DAYS[day]}
                  </Text>
                </View>
              );
            })}
          </View>
          {startTime && (
            <Text className="text-sm text-neutral-600">{startTime}에 시작해서 24시간 단식해요</Text>
          )}
        </Pressable>
      ) : (
        <Pressable
          onPress={open}
          className="flex-row items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-4">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-green-600">
            <MaterialIcons name="event" size={22} color={colors.white} />
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-base font-bold text-neutral-900">
              이번 주 단식 요일을 정해주세요
            </Text>
            <Text className="text-sm text-green-700">
              {week}주차는 주 {timesPerWeek}회 24시간 단식해요
            </Text>
          </View>
          <View className="rounded-full bg-green-600 px-4 py-2">
            <Text className="text-sm font-bold text-white">정하기</Text>
          </View>
        </Pressable>
      )}
      <FastingDayBottomSheet bottomSheetRef={sheetRef} week={week} />
    </>
  );
}
