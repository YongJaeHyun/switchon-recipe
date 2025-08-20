import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Text } from 'components/common/Text';
import { baseProfile } from 'const/assets';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import useKoreanToday from 'hooks/useKoreanToday';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { getWeekAndDay } from 'utils/date';
import { getWeekBGColor, getWeekBorderColor, getWeekColor } from 'utils/getWeekColor';

interface HomeHeaderProps {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
}

export default function HomeHeader({ bottomSheetRef }: HomeHeaderProps) {
  const { start_date, avatar_url } = useUserStore((state) => state);
  const today = useKoreanToday();

  const { week, day } = getWeekAndDay(start_date ?? today);
  return (
    <View>
      <View className="mb-1 mt-4 flex-row items-center justify-between">
        <Text className="text-neutral-600">오늘도 파이팅!</Text>
        <View className="h-11 w-11 overflow-hidden rounded-full border-2 border-neutral-300">
          <Link href={'/profile'}>
            <Image style={{ width: '100%', height: '100%' }} source={avatar_url ?? baseProfile} />
          </Link>
        </View>
      </View>
      <View className="flex-row items-end gap-3">
        <View className="flex-row items-end gap-2">
          <Text className={`text-4xl font-bold ${getWeekColor(week)}`}>{week}주차</Text>
          {week >= 5 && <Text className={`text-lg font-bold ${getWeekColor(week)}`}>(유지기)</Text>}
        </View>
        <Pressable onPress={() => bottomSheetRef.current?.expand()}>
          <Feather name="settings" size={18} />
        </Pressable>
      </View>

      <ScrollView
        className="mt-6"
        contentContainerClassName="gap-4 ml-2 pr-5"
        showsHorizontalScrollIndicator={false}
        horizontal>
        <View className="relative">
          <View className="absolute left-0 right-0 top-[1.125rem] z-0 mx-1 h-0.5 border-t border-neutral-400 bg-transparent" />
          <View
            className={`absolute left-0 top-[1.125rem] z-[1] mx-1 h-0.5 border-t bg-transparent ${getWeekBorderColor(week)}`}
            style={{
              width: day === 1 ? 0 : (day - 1) * 50,
            }}
          />
          <View className="flex-row gap-4">
            {Array(7)
              .fill(null)
              .map((_, i) => {
                const isCompleted = i + 1 < day;
                const isToday = i + 1 === day;

                return (
                  <View key={`${week}주차 ${i + 1}일`} className="z-10 items-center gap-1.5">
                    <View
                      className={`h-9 w-9 items-center justify-center rounded-full ${
                        isCompleted || isToday ? getWeekBGColor(week) : 'bg-neutral-300'
                      }`}>
                      {isCompleted && <MaterialIcons name="check" size={22} color="white" />}
                    </View>
                    <Text className={`text-sm ${isToday && `font-bold ${getWeekColor(week)}`}`}>
                      {isToday ? 'Today' : `${i + 1}일`}
                    </Text>
                  </View>
                );
              })}
          </View>
        </View>

        <View className="absolute left-0 right-0 top-[1.125rem] z-0 mx-5 h-0.5 border-t border-dashed border-neutral-400 bg-transparent" />
        <View key={`${week + 1}주차`} className="ml-2.5 items-center gap-1.5">
          <View
            className={`h-9 w-9 items-center justify-center rounded-full ${getWeekBGColor(week + 1)}`}>
            <MaterialIcons name="arrow-forward" size={22} color="white" />
          </View>
          <Text className={`text-sm font-bold ${getWeekColor(week + 1)}`}>{week + 1}주차</Text>
        </View>
      </ScrollView>
    </View>
  );
}
